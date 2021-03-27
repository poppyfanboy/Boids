const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

const config = {
    mode: 'none',
    entry: {
        boids: './src/index.ts',
    },
    devServer: {
        contentBase: './dist',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html',
            chunks: [ 'boids' ],
            filename: './index.html',
        }),
    ],
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        devtoolModuleFilenameTemplate: 'file:///[absolute-resource-path]',
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                use: [ 'style-loader', 'css-loader' ],
            },
            {
                test: /\.(png|svg|jpe?g|gif|vert|frag)$/i,
                type: 'asset/resource',
            },
        ],
    },
    resolve: {
        extensions: [ '.js', '.ts', '.d.ts', '.wasm', '.json', '.mjs' ],
    },
    optimization: {
        minimize: false,
        minimizer: [ new TerserPlugin({
            parallel: true,
        }) ],
    },
};

module.exports = (env, argv) => {
    if (argv.mode === 'development') {
        config.devtool = 'inline-source-map';
        config.plugins.push(new webpack.DefinePlugin({
            'process.env.DEV': JSON.stringify(true),
        }));
    }
    if (argv.mode === 'production') {
        config.optimization.minimize = true;
        config.optimization.usedExports = true;
        config.plugins.push(new webpack.DefinePlugin({
            'process.env.DEV': JSON.stringify(false),
        }));
    }

    return config;
};
