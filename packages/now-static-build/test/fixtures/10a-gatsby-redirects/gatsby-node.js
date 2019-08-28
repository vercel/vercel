"use strict";

exports.createPages = ({ actions }) => {
  const { createRedirect } = actions;

  createRedirect({
    fromPath: "/permanent",
    isPermanent: true,
    toPath: "/"
  });

  createRedirect({
    fromPath: "/not-permanent",
    isPermanent: false,
    toPath: "/"
  });

  createRedirect({
    fromPath: "/custom-status",
    statusCode: 404,
    toPath: "/"
  });
};
