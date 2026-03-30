#![allow(dead_code)]
use crate::ipc::core::RequestContext;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum LogType {
    Stream { stream: Stream },
    Level { level: Level },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LogPayload {
    pub context: RequestContext,
    pub message: String,
    #[serde(flatten)]
    pub log_type: LogType,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LogMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: LogPayload,
}

impl LogMessage {
    pub fn stream(invocation_id: String, request_id: u64, message: String, stream: Stream) -> Self {
        Self {
            message_type: "log".to_string(),
            payload: LogPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                message,
                log_type: LogType::Stream { stream },
            },
        }
    }

    pub fn level(invocation_id: String, request_id: u64, message: String, level: Level) -> Self {
        Self {
            message_type: "log".to_string(),
            payload: LogPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                message,
                log_type: LogType::Level { level },
            },
        }
    }

    pub fn encode_message(message: &str) -> String {
        use base64::Engine;
        use base64::engine::general_purpose::STANDARD as BASE64_ENCODER;
        BASE64_ENCODER.encode(message)
    }

    pub fn with_stream(
        invocation_id: String,
        request_id: u64,
        message: &str,
        stream: Stream,
    ) -> Self {
        Self::stream(
            invocation_id,
            request_id,
            Self::encode_message(message),
            stream,
        )
    }

    pub fn with_level(invocation_id: String, request_id: u64, message: &str, level: Level) -> Self {
        Self::level(
            invocation_id,
            request_id,
            Self::encode_message(message),
            level,
        )
    }
}
