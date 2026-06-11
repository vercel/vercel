import CryptoKit
import Foundation
import LocalAuthentication
import Security

// The Secure Enclave private key is non-exportable and lives in the SE. CryptoKit
// hands us an opaque `dataRepresentation` blob that only this machine's Secure
// Enclave can unwrap; we persist that blob to a file ourselves. This deliberately
// avoids the data-protection keychain (SecItem + kSecAttrIsPermanent), which on
// macOS requires a provisioning-profile-authorized entitlement and fails with
// errSecMissingEntitlement (-34018) under ad-hoc / Developer ID signing.
let keyFileEnvVar = "VERCEL_BIOMETRIC_KEY_FILE"
let defaultKeyFileName = "se-key.blob"

enum HelperError: Error {
    case unsupported(String)
    case invalidUsage(String)
    case message(String)
}

struct JsonError: Encodable {
    let ok: Bool
    let error: String
    let code: String
}

struct Capabilities: Encodable {
    let ok: Bool
    let platform: String
    let supported: Bool
    let hasKey: Bool
    let biometryAvailable: Bool
    let userPresenceAvailable: Bool
    let biometryType: String
    let secureEnclaveAvailable: Bool
}

struct Registration: Encodable {
    let ok: Bool
    let keyId: String
    let algorithm: String
    let storage: String
    let publicKey: String
}

struct Signature: Encodable {
    let ok: Bool
    let keyId: String
    let algorithm: String
    let storage: String
    let signature: String
}

struct DeleteResult: Encodable {
    let ok: Bool
    let deleted: Bool
}

func printJson<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ error: Error) -> Never {
    let message: String
    let code: String

    switch error {
    case HelperError.unsupported(let value):
        message = value
        code = "unsupported"
    case HelperError.invalidUsage(let value):
        message = value
        code = "invalid_usage"
    case HelperError.message(let value):
        message = value
        code = "error"
    default:
        let nsError = error as NSError
        message = nsError.localizedDescription
        // Map a user-cancelled Touch ID prompt to a stable, fallback-safe code so
        // the CLI can fall back to the browser/device-code flow without treating
        // it as a hard failure.
        if nsError.domain == LAError.errorDomain
            && (nsError.code == LAError.userCancel.rawValue
                || nsError.code == LAError.appCancel.rawValue
                || nsError.code == LAError.systemCancel.rawValue)
        {
            code = "canceled"
        } else if nsError.domain == NSOSStatusErrorDomain && nsError.code == Int(errSecUserCanceled) {
            code = "canceled"
        } else {
            code = nsError.domain
        }
    }

    try? printJson(JsonError(ok: false, error: message, code: code))
    exit(1)
}

func base64urlEncode(_ data: Data) -> String {
    data.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

func base64urlDecode(_ value: String) throws -> Data {
    var base64 = value
        .replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    let padding = (4 - base64.count % 4) % 4
    if padding > 0 {
        base64 += String(repeating: "=", count: padding)
    }
    guard let data = Data(base64Encoded: base64) else {
        throw HelperError.invalidUsage("Expected a base64url-encoded challenge.")
    }
    return data
}

func biometryName(_ type: LABiometryType) -> String {
    switch type {
    case .none:
        return "none"
    case .touchID:
        return "touchID"
    case .faceID:
        return "faceID"
    case .opticID:
        return "opticID"
    @unknown default:
        return "unknown"
    }
}

// MARK: - Blob persistence

func keyFileURL() -> URL {
    let fileManager = FileManager.default
    if let override = ProcessInfo.processInfo.environment[keyFileEnvVar], !override.isEmpty {
        return URL(fileURLWithPath: (override as NSString).expandingTildeInPath)
    }
    let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
    return base
        .appendingPathComponent("com.vercel.cli", isDirectory: true)
        .appendingPathComponent("biometric", isDirectory: true)
        .appendingPathComponent(defaultKeyFileName, isDirectory: false)
}

func loadBlob() -> Data? {
    let url = keyFileURL()
    guard FileManager.default.fileExists(atPath: url.path) else {
        return nil
    }
    return try? Data(contentsOf: url)
}

func saveBlob(_ blob: Data) throws {
    let url = keyFileURL()
    let directory = url.deletingLastPathComponent()
    try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700]
    )
    try blob.write(to: url, options: [.atomic, .completeFileProtection])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
}

func deleteBlob() -> Bool {
    let url = keyFileURL()
    guard FileManager.default.fileExists(atPath: url.path) else {
        return false
    }
    try? FileManager.default.removeItem(at: url)
    return true
}

// MARK: - Secure Enclave key

func requireSecureEnclave() throws {
    guard SecureEnclave.isAvailable else {
        throw HelperError.unsupported("The Secure Enclave is not available on this device.")
    }
}

func makeAccessControl() throws -> SecAccessControl {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryAny],
        &error
    ) else {
        throw error?.takeRetainedValue() ?? HelperError.message("Failed to create access control.")
    }
    return access
}

func loadExistingKey(
    context: LAContext? = nil
) throws -> SecureEnclave.P256.Signing.PrivateKey? {
    guard let blob = loadBlob() else {
        return nil
    }
    do {
        if let context {
            return try SecureEnclave.P256.Signing.PrivateKey(
                dataRepresentation: blob,
                authenticationContext: context
            )
        }
        return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob)
    } catch {
        // A blob that no longer decodes (e.g. the Secure Enclave key material was
        // reset) is treated as "no key" so callers can re-register cleanly.
        return nil
    }
}

func createKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
    let access = try makeAccessControl()
    let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access)
    try saveBlob(key.dataRepresentation)
    return key
}

func publicKeyData(for key: SecureEnclave.P256.Signing.PrivateKey) -> Data {
    // x9.63 uncompressed point (0x04 || X || Y). The API/Node verifier wraps this
    // with the SPKI P-256 prefix to reconstruct the SubjectPublicKeyInfo.
    key.publicKey.x963Representation
}

func keyId(for publicKey: Data) -> String {
    base64urlEncode(Data(SHA256.hash(data: publicKey)))
}

// MARK: - Commands

func handleCapabilities() throws {
    let context = LAContext()
    var biometryError: NSError?
    let biometryAvailable = context.canEvaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics, error: &biometryError)
    var userPresenceError: NSError?
    let userPresenceAvailable = context.canEvaluatePolicy(
        .deviceOwnerAuthentication, error: &userPresenceError)
    let secureEnclaveAvailable = SecureEnclave.isAvailable
    let hasKey = loadBlob() != nil

    try printJson(Capabilities(
        ok: true,
        platform: "darwin",
        supported: secureEnclaveAvailable && userPresenceAvailable,
        hasKey: hasKey,
        biometryAvailable: biometryAvailable,
        userPresenceAvailable: userPresenceAvailable,
        biometryType: biometryName(context.biometryType),
        secureEnclaveAvailable: secureEnclaveAvailable
    ))
}

func handleRegisterKey() throws {
    try requireSecureEnclave()
    let key = try loadExistingKey() ?? createKey()
    let publicKey = publicKeyData(for: key)
    try printJson(Registration(
        ok: true,
        keyId: keyId(for: publicKey),
        algorithm: "ES256",
        storage: "secure-enclave",
        publicKey: base64urlEncode(publicKey)
    ))
}

func handleSignChallenge(_ args: [String]) throws {
    guard args.count == 3 else {
        throw HelperError.invalidUsage("Usage: sign-challenge <base64url-challenge>")
    }
    try requireSecureEnclave()

    let challenge = try base64urlDecode(args[2])
    let context = LAContext()
    context.localizedReason = "Authorize Vercel CLI sensitive action"
    guard let key = try loadExistingKey(context: context) else {
        throw HelperError.message("No biometric key is registered.")
    }

    let publicKey = publicKeyData(for: key)
    // signature(for:) hashes the challenge with SHA-256, then signs over the
    // P-256 curve, producing an ECDSA (ES256) signature. derRepresentation is the
    // X9.62 DER form the Node verifier expects.
    let signature = try key.signature(for: challenge)

    try printJson(Signature(
        ok: true,
        keyId: keyId(for: publicKey),
        algorithm: "ES256",
        storage: "secure-enclave",
        signature: base64urlEncode(signature.derRepresentation)
    ))
}

func handleDeleteKey() throws {
    try printJson(DeleteResult(ok: true, deleted: deleteBlob()))
}

do {
    let args = CommandLine.arguments
    guard args.count >= 2 else {
        throw HelperError.invalidUsage(
            "Usage: capabilities | register-key | sign-challenge <challenge> | delete-key")
    }

    switch args[1] {
    case "capabilities":
        try handleCapabilities()
    case "register-key":
        try handleRegisterKey()
    case "sign-challenge":
        try handleSignChallenge(args)
    case "delete-key":
        try handleDeleteKey()
    default:
        throw HelperError.invalidUsage("Unknown command: \(args[1])")
    }
} catch {
    fail(error)
}
