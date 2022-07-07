const webpack  = require('webpack');

module.exports = {
    configureWebpack: {
        resolve: {
          fallback:{
            fs: false,
            module: false,
          }
        },

        plugins:[
          new webpack.ProvidePlugin({
            process:'process/browser.js'
          })
        ]
    },
}