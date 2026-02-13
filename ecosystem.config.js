module.exports = {
    apps: [{
      name: 'FetchServerList',
      script: './fetchServerList.js',
      watch: false,
      restart_delay: 30000, 
      max_restarts: -1,      
    }]
  };
  