use axum::{
    extract::{Json, Path},
    http::{header, Uri},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Serialize;
use tokio::net::TcpListener;

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

async fn home() -> impl IntoResponse {
    Html(include_str!("../public/index.html"))
}

async fn get_data() -> impl IntoResponse {
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
    Json(DataResponse {
        data: items,
        total,
        timestamp: "2024-01-01T00:00:00Z".to_string(),
    })
}

async fn get_item(Path(item_id): Path<u32>) -> impl IntoResponse {
    Json(ItemResponse {
        item: DataItem {
            id: item_id,
            name: format!("Sample Item {}", item_id),
            value: item_id * 100,
        },
        timestamp: "2024-01-01T00:00:00Z".to_string(),
    })
}

async fn favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/x-icon")],
        include_bytes!("../public/favicon.ico").as_slice(),
    )
}

async fn fallback(uri: Uri) -> impl IntoResponse {
    (
        axum::http::StatusCode::NOT_FOUND,
        format!("Not found: {}", uri.path()),
    )
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let router = Router::new()
        .route("/", get(home))
        .route("/favicon.ico", get(favicon))
        .route("/api/data", get(get_data))
        .route("/api/items/{item_id}", get(get_item))
        .fallback(fallback);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    axum::serve(listener, router).await
}
