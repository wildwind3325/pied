var fs = require('fs');
var MemoryStream = require('memorystream');
var request = require('request').defaults({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36'
  }
});

var api = {
  fileRead(file) {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (error) {
      return '';
    }
  },
  fileWrite(file, content) {
    try {
      fs.writeFileSync(file, content);
      return 'OK';
    }
    catch (error) {
      return 'ERROR';
    }
  },
  findCookie(cookies, name) {
    if (!cookies || cookies.length == 0) {
      return '';
    }
    for (let i = 0; i < cookies.length; i++) {
      if (cookies[i].indexOf(name) >= 0) {
        return cookies[i].substring(0, cookies[i].indexOf(';') + 1);
      }
    }
    return '';
  },
  num2mask(value, mask) {
    let ret = value.toString();
    for (let i = 0; i < mask - value.toString().length; i++) {
      ret = '0' + ret;
    }
    return ret;
  },
  webGet(options) {
    return new Promise((resolve, reject) => {
      request({
        method: options.method || 'GET',
        url: options.url,
        headers: {
          'Cookie': options.cookie || '',
          'Referer': options.referer || ''
        },
        proxy: options.proxy || '',
        timeout: (options.timeout || 10) * 1000
      }, (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  },
  webPost(options) {
    return new Promise((resolve, reject) => {
      request({
        method: options.method || 'POST',
        url: options.url,
        form: options.body,
        headers: {
          'Cookie': options.cookie || '',
          'Referer': options.referer || ''
        },
        proxy: options.proxy || '',
        timeout: (options.timeout || 10) * 1000,
        followRedirect: false
      }, (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  },
  webHead(options) {
    return new Promise((resolve, reject) => {
      request({
        method: options.method || 'HEAD',
        url: options.url,
        headers: {
          'Cookie': options.cookie || '',
          'Referer': options.referer || ''
        },
        proxy: options.proxy || '',
        timeout: (options.timeout || 10) * 1000
      }, (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  },
  webDownload(options) {
    return new Promise((resolve, reject) => {
      let stream = new MemoryStream(null, {
        readable: true,
        writable: true
      });
      request({
        method: options.method || 'GET',
        url: options.url,
        headers: {
          'Cookie': options.cookie || '',
          'Referer': options.referer || ''
        },
        proxy: options.proxy || '',
        timeout: (options.timeout || 60) * 1000
      }).pipe(stream).on('finish', () => {
        let fileStream = fs.createWriteStream(options.fileName);
        stream.pipe(fileStream).on('finish', () => {
          resolve('OK');
        }).on('error', error => {
          reject(error);
        });
      }).on('error', error => {
        reject(error);
      });
    });
  },
  async webDownloadByBlock(options) {
    let times = parseInt(options.totalSize / options.blockSize);
    if (options.totalSize % options.blockSize > 0) {
      times++;
    }
    for (let i = 0; i < times; i++) {
      let fileStream = fs.createWriteStream(options.fileName, { 'flags': 'a' });
      let start = i * options.blockSize;
      let end = Math.min(options.totalSize - 1, start + options.blockSize - 1);
      let range = 'bytes=' + start + '-' + end;
      let result = await this.pipeStream(request({
        method: options.method || 'GET',
        url: options.url,
        headers: {
          'Cookie': options.cookie || '',
          'Referer': options.referer || '',
          'Range': range
        },
        proxy: options.proxy || '',
        timeout: (options.timeout || 60) * 1000
      }).pipe(fileStream));
      if (result != 'OK') {
        if (fs.existsSync(options.fileName)) {
          fs.unlinkSync(options.fileName);
        }
        throw 'Download failed.';
      }
    }
  },
  pipeStream(stream) {
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve('OK');
      }).on('error', error => {
        reject(error);
      });
    });
  }
};

module.exports = api;