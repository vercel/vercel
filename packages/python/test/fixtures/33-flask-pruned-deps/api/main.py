import numpy as np
import pandas as pd
import networkx as nx
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/hello')
def hello():
    a = np.array([1, 2, 3])
    numpy_sum = int(a.sum())

    df = pd.DataFrame({"a": [1, 2, 3]})
    pandas_rows = int(df.shape[0])

    G = nx.Graph()
    G.add_edge("x", "y")
    networkx_nodes = int(G.number_of_nodes())

    return jsonify(
        numpy_sum=numpy_sum,
        pandas_rows=pandas_rows,
        networkx_nodes=networkx_nodes,
    )


if __name__ == '__main__':
    app.run(debug=True, port=8002)


