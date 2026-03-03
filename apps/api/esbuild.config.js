const esbuildPluginTsc = require('esbuild-plugin-tsc');

module.exports = {
  sourcemap: true,
  outExtension: { '.js': '.js' },
  plugins: [
    esbuildPluginTsc({
      tsconfigPath: './apps/api/tsconfig.app.json',
    }),
  ],
};
