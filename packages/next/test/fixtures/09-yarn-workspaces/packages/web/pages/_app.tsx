import App from "next/app";
import React from "react";

class MyApp extends App<any> {
  static async getInitialProps() {
    console.log("i am props");
    return { q: 5, pageProps: {} };
  }

  render() {
    const { Component, pageProps } = this.props;

    return (
      <>
        <div>yo</div>
        <Component {...pageProps} />
        <style jsx global>
          {`
            html {
              min-height: 100%;
              display: flex;
              flex-direction: column;
              position: relative;
            }

            h1 {
              font-size: 40px;
            }

            body,
            body > div {
              flex: 1;
              display: flex;
              flex-direction: column;
            }

            div,
            input,
            form,
            li,
            ul {
              box-sizing: border-box;
            }

            a {
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
          `}
        </style>
      </>
    );
  }
}

export default MyApp;
