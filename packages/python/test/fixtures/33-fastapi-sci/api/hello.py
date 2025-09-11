from fastapi import FastAPI
import numpy as np
import pandas as pd
import networkx as nx

app = FastAPI()


@app.get("/api/hello")
def hello():
    a = np.array([1, 2, 3])
    numpy_sum = int(a.sum())

    df = pd.DataFrame({"a": [1, 2, 3]})
    pandas_rows = int(df.shape[0])

    G = nx.Graph()
    G.add_edge("x", "y")
    networkx_nodes = int(G.number_of_nodes())

    return {
        "numpy_sum": numpy_sum,
        "pandas_rows": pandas_rows,
        "networkx_nodes": networkx_nodes,
    }
