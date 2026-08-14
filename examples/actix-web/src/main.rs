use serde::Serialize;
use tower::ServiceBuilder;
use vercel_runtime::actix::{handler_fn, convert_request, VercelLayer};
use vercel_runtime::{Error, Request, Response, ResponseBody};

#[derive(Serialize)]
struct DataItem {
    id: u32,
    name: String,
    value: u32,
}

#[derive(Serialize)]
struct DataResponse {
    data: Vec<DataItem>,
    total: usize,
    timestamp: String,
}

#[derive(Serialize)]
struct ItemResponse {
    item: DataItem,
    timestamp: String,
}

async fn handler(req: Request) -> Result<Response<ResponseBody>, Error> {
    let (method, uri, _headers, _body) = convert_request(req).await?;

    // Simple routing
    match (method.as_str(), uri.as_str()) {
        ("GET", "/") => {
            let html = include_str!("../public/index.html");
            Ok(Response::builder()
                .status(200)
                .header("content-type", "text/html; charset=utf-8")
                .body(html.into())?)
        }
        ("GET", "/favicon.ico") => {
            let favicon = include_bytes!("../public/favicon.ico");
            Ok(Response::builder()
                .status(200)
                .header("content-type", "image/x-icon")
                .body(favicon.to_vec().into())?)
        }
        ("GET", "/api/data") => {
            let items = vec![
                DataItem {
                    id: 1,
                    name: "Sample Item 1".to_string(),
                    value: 100,
                },
                DataItem {
                    id: 2,
                    name: "Sample Item 2".to_string(),
                    value: 200,
                },
                DataItem {
                    id: 3,
                    name: "Sample Item 3".to_string(),
                    value: 300,
                },
            ];
            let total = items.len();
            let response = DataResponse {
                data: items,
                total,
                timestamp: "2024-01-01T00:00:00Z".to_string(),
            };
            let json = serde_json::to_string(&response)?;
            Ok(Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .body(json.into())?)
        }
        ("GET", path) if path.starts_with("/api/items/") => {
            let item_id: u32 = path
                .strip_prefix("/api/items/")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let response = ItemResponse {
                item: DataItem {
                    id: item_id,
                    name: format!("Sample Item {}", item_id),
                    value: item_id * 100,
                },
                timestamp: "2024-01-01T00:00:00Z".to_string(),
            };
            let json = serde_json::to_string(&response)?;
            Ok(Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .body(json.into())?)
        }
        _ => Ok(Response::builder()
            .status(404)
            .header("content-type", "text/plain")
            .body(format!("Not found: {}", uri).into())?),
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let service = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(handler_fn(handler));

    vercel_runtime::run(service).await
}
