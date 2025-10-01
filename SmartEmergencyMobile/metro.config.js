

const { getDefaultConfig } = require('@react-native/metro-config');

const config = getDefaultConfig(__dirname);

// Allow loading ONNX models and other required assets
config.resolver.assetExts.push('bin', 'txt', 'json');  // Ensure .bin and .json are recognized as asset types
config.resolver.sourceExts.push('jsx', 'js', 'ts', 'tsx', 'json');

// Handle assets and models properly
config.resolver.platforms = ['native', 'ios', 'android', 'web'];



// Optional: Metro bundler timeout (increased for large files like models)
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setTimeout(600000);  // Set timeout for long operations (e.g., large model loading)
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
