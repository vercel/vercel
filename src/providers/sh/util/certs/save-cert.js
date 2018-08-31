// @flow
import path from 'path'
import fs from 'fs-extra'
import type { CertificateDetails } from "../types";

export default function saveCert(filePath: string, cert: CertificateDetails) {
  return Promise.all([
    fs.writeFile(path.resolve(filePath, `${cert.uid}-crt.pem`), cert.crt),
    fs.writeFile(path.resolve(filePath, `${cert.uid}-ca.pem`), cert.ca),
    fs.writeFile(path.resolve(filePath, `${cert.uid}-key.pem`), cert.key)
  ])
}
