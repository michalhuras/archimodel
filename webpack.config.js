const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'web',
  entry: {
    main: './src/js/main.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080,
    hot: true,
    open: true
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false
        }
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[hash][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      chunks: ['main']
    }),
    new CopyWebpackPlugin({
      patterns: [
        { 
          from: 'src/assets/favicon.ico', 
          to: 'favicon.ico',
          noErrorOnMissing: true
        },
        {
          from: 'src/assets/icons',
          to: 'assets/icons',
          noErrorOnMissing: true
        },
        {
          from: 'src/i18n',
          to: 'i18n',
          noErrorOnMissing: true
        },
        {
          from: 'src/style.css',
          to: 'style.css',
          noErrorOnMissing: false
        },
        {
          from: 'src/version.json',
          to: 'version.json',
          noErrorOnMissing: true
        },
      ]
    })
  ],
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        }
      }
    }
  }
};
