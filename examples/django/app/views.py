from django.http import HttpResponse, JsonResponse


def index(request):
    return HttpResponse(
        """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vercel + Django</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.ico">
        <link rel="stylesheet" href="/static/app/style.css">
    </head>
    <body>
        <header>
            <nav>
                <a href="/" class="logo">Vercel + Django</a>
                <div class="nav-links">
                    <a href="/api/data">API</a>
                </div>
            </nav>
        </header>
        <main>
            <div class="hero">
                <h1>Vercel + Django</h1>
                <div class="hero-code">
                    <pre><code><span class="keyword">from</span> <span class="module">django</span>.<span class="module">http</span> <span class="keyword">import</span> <span class="class">HttpResponse</span>

<span class="keyword">def</span> <span class="function">index</span>(<span class="variable">request</span>):
    <span class="keyword">return</span> <span class="class">HttpResponse</span>(<span class="string">"Python on Vercel"</span>)</code></pre>
                </div>
            </div>

            <div class="cards">
                <div class="card">
                    <h3>Sample Data</h3>
                    <p>Access sample JSON data through our REST API. Perfect for testing and development purposes.</p>
                    <a href="/api/data">Get Data →</a>
                </div>
            </div>
        </main>
    </body>
    </html>
    """,
        content_type='text/html',
    )


def api_data(request):
    return JsonResponse(
        {
            'data': [
                {'id': 1, 'name': 'Sample Item 1', 'value': 100},
                {'id': 2, 'name': 'Sample Item 2', 'value': 200},
                {'id': 3, 'name': 'Sample Item 3', 'value': 300},
            ],
            'total': 3,
            'timestamp': '2024-01-01T00:00:00Z',
        }
    )
