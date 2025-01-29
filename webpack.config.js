// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

const copyPlugin = require("copy-webpack-plugin");
const path = require("path");
const { DefinePlugin } = require("webpack");

/** @type {Partial<import('webpack').Configuration>} */
const commonConfig = {
	devtool: "source-map",
	mode: "production",
	//mode: "development",
	module: {
		rules: [
			{
				exclude: /node_modules/,
				test: /\.tsx?$/,
				use: {
					loader: "ts-loader",
					options: {
						transpileOnly: true,
						compilerOptions: {},
					},
				},
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
	},
};

/**
 * @param {Record<string, unknown>} env
 * @returns {import('webpack').Configuration | import('webpack').Configuration[]}
 */
module.exports = (env) => {
	return [
		{
			...commonConfig,
			entry: {
				host: "./src/host/mainHost.ts",
			},
			name: "host",
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "build/js/host"),
			},
		},
		/*{
			...commonConfig,
			entry: {
				screencast: "./src/screencast/main.ts",
			},
			name: "screencast",
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "build/js/screencast"),
			},
		},*/
		{
			...commonConfig,
			entry: {
				"extension.entry": "./src/extension/extension.entry.ts",
			},
			externals: {
				vscode: "commonjs vscode",
				//ws: "commonjs ws",
			},
			target: "node",
			output: {
				devtoolModuleFilenameTemplate: "../[resource-path]",
				filename: "[name].js",
				libraryTarget: "commonjs2",
				path: path.resolve(__dirname, "build/js/extension"),
			},
			// Copy startpage html to output bundle
			plugins: [
				// These must also be defined in the jest section of package.json for tests to pass
				new DefinePlugin({
					DEBUG: JSON.stringify(env.debug ?? false),
					DEVTOOLS_BASE_URI: JSON.stringify(
						env.devtoolsBaseUri ?? undefined
					),
				}),
			],
		},
	];
};
