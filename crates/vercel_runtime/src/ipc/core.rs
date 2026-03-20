use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct RequestContext {
    #[serde(rename = "invocationId")]
    pub invocation_id: String,
    #[serde(rename = "requestId")]
    pub request_id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StartMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: StartPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StartPayload {
    #[serde(rename = "initDuration")]
    pub init_duration: u64,
    #[serde(rename = "httpPort")]
    pub http_port: u16,
}

impl StartMessage {
    pub fn new(init_duration: u64, http_port: u16) -> Self {
        Self {
            message_type: "server-started".to_string(),
            payload: StartPayload {
                init_duration,
                http_port,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EndMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: EndPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EndPayload {
    pub context: RequestContext,
    pub error: Option<serde_json::Value>,
}

impl EndMessage {
    pub fn new(invocation_id: String, request_id: u64, error: Option<serde_json::Value>) -> Self {
        Self {
            message_type: "end".to_string(),
            payload: EndPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                error,
            },
        }
    }
}
