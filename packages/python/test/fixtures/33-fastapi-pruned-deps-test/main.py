from fastapi import FastAPI
import numpy as np
import pandas as pd
import networkx as nx
import sympy as sp


app = FastAPI()

@app.get("/hello")
async def stream():
    # numpy
    arr = np.array([1, 2, 3])
    np_sum = int(arr.sum())
    np_dot = int(np.dot(arr, arr))
    mat = np.arange(1, 5).reshape(2, 2)
    np_matmul = (mat @ mat).tolist()

    # pandas
    df = pd.DataFrame({"group": ["a", "a", "b"], "val": [1, 2, 3]})
    pd_group_sum = df.groupby("group")["val"].sum().to_dict()
    pd_mean = float(df["val"].mean())
    pd_first_val = int(df["val"].iloc[0])

    # networkx
    G = nx.Graph()
    G.add_nodes_from([1, 2, 3])
    G.add_edges_from([(1, 2), (2, 3)])
    nx_nodes = G.number_of_nodes()
    nx_shortest = nx.shortest_path(G, source=1, target=3)
    nx_degrees = dict(G.degree())

    # sympy
    x = sp.symbols("x")
    sp_expanded = str(sp.expand((x + 1) ** 3))
    sp_derivative = str(sp.diff(sp.sin(x), x))
    sp_solutions = [int(r) for r in sp.solve(sp.Eq(x**2 - 1, 0), x)]

    return {
        "message": "Hello, World!",
        "numpy": {"sum": np_sum, "dot": np_dot, "matmul": np_matmul},
        "pandas": {
            "group_sum": pd_group_sum,
            "mean": pd_mean,
            "first_val": pd_first_val,
        },
        "networkx": {
            "num_nodes": nx_nodes,
            "shortest_1_to_3": nx_shortest,
            "degrees": nx_degrees,
        },
        "sympy": {
            "expanded": sp_expanded,
            "derivative": sp_derivative,
            "solutions": sp_solutions,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
