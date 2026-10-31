const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname];

config.resolver.blockList = [
  /\.local[\\/]state[\\/]workflow-logs[\\/].*/,
  /\.local[\\/]state[\\/].*/,
];

module.exports = config;
