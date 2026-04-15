use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Instant;

use super::{BlockResult, Executor, ExecutorError};

#[derive(Debug, Deserialize)]
struct KeyValue {
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct HttpParams {
    method: String,
    url: String,
    #[serde(default)]
    params: Vec<KeyValue>,
    #[serde(default)]
    headers: Vec<KeyValue>,
    #[serde(default)]
    body: String,
}

pub struct HttpExecutor {
    client: Client,
}

impl HttpExecutor {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

#[async_trait]
impl Executor for HttpExecutor {
    fn block_type(&self) -> &str {
        "http"
    }

    async fn validate(&self, params: &serde_json::Value) -> Result<(), String> {
        let p: HttpParams =
            serde_json::from_value(params.clone()).map_err(|e| format!("Invalid params: {e}"))?;
        if p.url.trim().is_empty() {
            return Err("URL is required".to_string());
        }
        Ok(())
    }

    async fn execute(
        &self,
        params: serde_json::Value,
    ) -> Result<BlockResult, ExecutorError> {
        let p: HttpParams = serde_json::from_value(params)
            .map_err(|e| ExecutorError(format!("Invalid params: {e}")))?;

        // Build URL with query params
        let mut url =
            reqwest::Url::parse(&p.url).map_err(|e| ExecutorError(format!("Invalid URL: {e}")))?;
        for kv in &p.params {
            if !kv.key.is_empty() {
                url.query_pairs_mut().append_pair(&kv.key, &kv.value);
            }
        }

        // Build request
        let method = p
            .method
            .parse::<reqwest::Method>()
            .map_err(|e| ExecutorError(format!("Invalid method: {e}")))?;

        let mut req = self.client.request(method.clone(), url);

        // Add headers
        for kv in &p.headers {
            if !kv.key.is_empty() {
                req = req.header(&kv.key, &kv.value);
            }
        }

        // Add body for methods that support it
        let has_body = matches!(
            method,
            reqwest::Method::POST | reqwest::Method::PUT | reqwest::Method::PATCH
        );
        if has_body && !p.body.is_empty() {
            req = req
                .header("Content-Type", "application/json")
                .body(p.body);
        }

        // Execute
        let start = Instant::now();
        let response = req
            .send()
            .await
            .map_err(|e| ExecutorError(format!("Request failed: {e}")))?;
        let duration_ms = start.elapsed().as_millis() as u64;

        let status_code = response.status().as_u16();
        let status_text = response
            .status()
            .canonical_reason()
            .unwrap_or("")
            .to_string();

        // Collect response headers
        let resp_headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response
            .text()
            .await
            .map_err(|e| ExecutorError(format!("Failed to read body: {e}")))?;

        let status = if status_code < 400 {
            "success"
        } else {
            "error"
        };

        Ok(BlockResult {
            status: status.to_string(),
            data: serde_json::json!({
                "status_code": status_code,
                "status_text": status_text,
                "headers": resp_headers,
                "body": body,
            }),
            duration_ms,
        })
    }
}
