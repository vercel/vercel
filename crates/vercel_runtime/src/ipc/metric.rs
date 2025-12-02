#![allow(dead_code)]
use crate::ipc::core::RequestContext;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct MetricMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: MetricPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MetricPayload {
    pub context: RequestContext,
    #[serde(rename = "type")]
    pub metric_type: Option<String>,
    #[serde(rename = "payload")]
    pub metric_payload: Option<serde_json::Value>,
}

impl MetricMessage {
    pub fn new(
        invocation_id: String,
        request_id: u64,
        metric_type: Option<String>,
        metric_payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            message_type: "metric".to_string(),
            payload: MetricPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                metric_type,
                metric_payload,
            },
        }
    }
}
