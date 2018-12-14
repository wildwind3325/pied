var api = require('./api')

var carlo = require('carlo');
var cheerio = require('cheerio');
var fs = require('fs');
var os = require('os');
var path = require('path');

var app;

var data = {
  pixiv: {
    account: '',
    password: '',
    cookie: '',
    proxy: ''
  },
  inkbunny: {
    account: '',
    password: '',
    cookie: '',
    proxy: ''
  },
  exhentai: {
    account: '',
    password: '',
    cookie: '',
    proxy: ''
  }
};
var configFile = path.join(os.homedir(), 'pied.json');

var cancelFlags = {
  'pixiv': false,
  'inkbunny': false,
  'exhentai': false
};

(async () => {
  app = await carlo.launch();
  let store = api.fileRead(configFile);
  if (store) {
    data = JSON.parse(store);
  }
  app.on('exit', () => {
    api.fileWrite(configFile, JSON.stringify(data));
    process.exit();
  });
  app.serveFolder(path.join(__dirname, 'www'));
  await app.exposeFunction('invokeHybrid', invokeHybrid);
  await app.load('main.htm');
  await app.evaluate(_data => {
    setFormObj('pixiv', _data.pixiv);
    setFormObj('inkbunny', _data.inkbunny);
    setFormObj('exhentai', _data.exhentai);
  }, data);
})();

var invokeHybrid = async function (method, param) {
  switch (method) {
    case 'pixivNewTask':
      cancelFlags['pixiv'] = false;
      startPixivTask(param);
      break;
    case 'inkbunnyNewTask':
      cancelFlags['inkbunny'] = false;
      startInkbunnyTask(param);
      break;
    case 'exhentaiNewTask':
      cancelFlags['exhentai'] = false;
      startExhentaiTask(param);
      break;
    case 'pixivCancelTask':
      cancelFlags['pixiv'] = true;
      break;
    case 'inkbunnyCancelTask':
      cancelFlags['inkbunny'] = true;
      break;
    case 'exhentaiCancelTask':
      cancelFlags['exhentai'] = true;
      break;
    default:
      console.log('Unknown command: ' + method);
      break;
  }
};

var startPixivTask = async function (param) {
  try {
    let pos = 0;
    let metafile = path.join(param.savePath, '.piedmeta');
    let metadata = api.fileRead(metafile);
    let piedmeta;
    if (metadata) {
      piedmeta = JSON.parse(metadata);
    } else {
      piedmeta = {
        pixiv: {},
        inkbunny: {}
      };
      api.fileWrite(metafile, JSON.stringify(piedmeta));
    }
    if (piedmeta.pixiv[param.userId]) {
      pos = piedmeta.pixiv[param.userId];
    } else {
      piedmeta.pixiv[param.userId] = 0;
    }

    let res = await api.webGet({
      url: 'https://www.pixiv.net/mypage.php',
      cookie: data.pixiv.cookie,
      proxy: param.proxy,
      timeout: 10
    });
    if (res.body.indexOf('/logout.php') == -1) {
      await app.evaluate(() => {
        logger('pixiv', 'Try to logon to Pixiv.');
      });
      if (!param.account || !param.password) {
        throw 'Account and password needed.';
      }
      res = await api.webGet({
        url: 'https://accounts.pixiv.net/login?lang=en&source=pc&view_type=page&ref=wwwtop_accounts_index',
        proxy: param.proxy,
        timeout: 10
      });
      let phpsessid = api.findCookie(res.headers['set-cookie'], 'PHPSESSID');
      let pg_login = cheerio.load(res.body);
      let postKey = pg_login('input[name="post_key"]').val();
      res = await api.webPost({
        url: 'https://accounts.pixiv.net/api/login?lang=en',
        body: {
          pixiv_id: param.account,
          captcha: '',
          g_recaptcha_response: '',
          password: param.password,
          post_key: postKey,
          source: 'pc',
          ref: 'wwwtop_accounts_index',
          return_to: 'https%3A%2F%2Fwww.pixiv.net%2F'
        },
        cookie: phpsessid,
        proxy: param.proxy,
        timeout: 10
      });
      phpsessid = api.findCookie(res.headers['set-cookie'], 'PHPSESSID');
      res = await api.webGet({
        url: 'https://www.pixiv.net/mypage.php',
        cookie: phpsessid,
        proxy: param.proxy,
        timeout: 10
      });
      if (res.body.indexOf('/logout.php') == -1) {
        throw 'Login failed.';
      } else {
        data.pixiv.account = param.account;
        data.pixiv.password = param.password;
        data.pixiv.cookie = phpsessid;
        api.fileWrite(configFile, JSON.stringify(data));
        await app.evaluate(() => {
          logger('pixiv', 'Login succeeded.');
        });
      }
    }

    res = await api.webGet({
      url: 'https://www.pixiv.net/ajax/user/' + param.userId + '/profile/all',
      cookie: data.pixiv.cookie,
      proxy: param.proxy,
      timeout: 10
    });
    let userData = JSON.parse(res.body);
    let list = new Array();
    for (let sid in userData.body.illusts) {
      let id = parseInt(sid);
      if (id <= pos) {
        break;
      }
      list.push(id);
    }
    for (let sid in userData.body.manga) {
      let id = parseInt(sid);
      if (id <= pos) {
        break;
      }
      list.push(id);
    }
    list.sort((a, b) => {
      return a - b;
    });

    for (let i = 0; i < list.length; i++) {
      if (cancelFlags['pixiv']) {
        break;
      }
      await app.evaluate((progress) => {
        $('#pixivProgress').text(progress);
      }, i + ' / ' + list.length);
      res = await api.webGet({
        url: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=' + list[i],
        cookie: data.pixiv.cookie,
        proxy: param.proxy,
        timeout: 10
      });
      let p1 = res.body.indexOf('{token:');
      let p2 = res.body.indexOf('mute') + 10;
      let cgdata = eval('(' + res.body.substring(p1, p2) + ')');
      let count = cgdata['preload']['illust'][list[i].toString()]['userIllusts'][list[i].toString()]['pageCount'];
      let original = cgdata['preload']['illust'][list[i].toString()]['urls']['original'];
      if (original.indexOf('ugoira') != -1) {
        let fileName = path.join(param.savePath, list[i] + '.zip');
        if (!fs.existsSync(fileName)) {
          res = await api.webGet({
            url: 'https://www.pixiv.net/ajax/illust/' + list[i] + '/ugoira_meta',
            cookie: data.pixiv.cookie,
            proxy: param.proxy,
            timeout: 10
          });
          let ugoiraData = JSON.parse(res.body);
          let fileUrl = ugoiraData['body']['originalSrc'] || ugoiraData['body']['src'];
          res = await api.webHead({
            url: fileUrl,
            cookie: data.pixiv.cookie,
            referer: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=' + list[i],
            proxy: param.proxy,
            timeout: 10
          });
          await api.webDownloadByBlock({
            url: fileUrl,
            fileName: fileName,
            totalSize: parseInt(res.headers['content-length']),
            blockSize: 300000,
            cookie: data.pixiv.cookie,
            referer: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=' + list[i],
            proxy: param.proxy,
            timeout: 120
          });
          api.fileWrite(path.join(param.savePath, list[i] + '.frames'), JSON.stringify(ugoiraData['body']));
        }
      } else if (count == 1) {
        let ext = original.substring(original.lastIndexOf('.'));
        let fileName = path.join(param.savePath, list[i] + ext);
        if (!fs.existsSync(fileName)) {
          await api.webDownload({
            url: original,
            fileName: fileName,
            cookie: data.pixiv.cookie,
            referer: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=' + list[i],
            proxy: param.proxy,
            timeout: 300
          });
        }
      } else {
        if (!fs.existsSync(path.join(param.savePath, list[i] + '.zip'))) {
          let mask = Math.max((count - 1).toString().length, 2);
          for (let j = 0; j < count; j++) {
            if (cancelFlags['pixiv']) {
              break;
            }
            await app.evaluate(progress => {
              $('#pixivProgress').text(progress);
            }, i + ' / ' + list.length + ' | ' + j + ' / ' + count);
            res = await api.webGet({
              url: 'https://www.pixiv.net/member_illust.php?mode=manga_big&illust_id=' + list[i] + '&page=' + j,
              cookie: data.pixiv.cookie,
              referer: 'https://www.pixiv.net/member_illust.php?mode=manga&illust_id=' + list[i],
              proxy: param.proxy,
              timeout: 10
            });
            let pg_manga = cheerio.load(res.body);
            let fileUrl = pg_manga('img').first().attr('src');
            let ext = fileUrl.substring(fileUrl.lastIndexOf('.'));
            let fileName = path.join(param.savePath, list[i] + '_' + api.num2mask(j, mask) + ext);
            if (!fs.existsSync(fileName)) {
              await api.webDownload({
                url: fileUrl,
                fileName: fileName,
                cookie: data.pixiv.cookie,
                referer: 'https://www.pixiv.net/member_illust.php?mode=manga_big&illust_id=' + list[i] + '&page=' + j,
                proxy: param.proxy,
                timeout: 300
              });
            }
            await app.evaluate(progress => {
              $('#pixivProgress').text(progress);
            }, i + ' / ' + list.length + ' | ' + (j + 1) + ' / ' + count);
          }
        }
      }
      if (!cancelFlags['pixiv']) {
        piedmeta.pixiv[param.userId] = list[i];
        api.fileWrite(metafile, JSON.stringify(piedmeta));
        await app.evaluate(progress => {
          $('#pixivProgress').text(progress);
        }, (i + 1) + ' / ' + list.length);
      }
    }

    data.pixiv.proxy = param.proxy;
  } catch (error) {
    await app.evaluate(_error => {
      logger('pixiv', 'Error: ' + JSON.stringify(_error));
    }, error);
  }
  await app.evaluate(() => {
    busyFlags['pixiv'] = false;
    logger('pixiv', 'Task done.');
  });
};

var startInkbunnyTask = async function (param) {
  try {
    let pos = 0;
    let metafile = path.join(param.savePath, '.piedmeta');
    let metadata = api.fileRead(metafile);
    let piedmeta;
    if (metadata) {
      piedmeta = JSON.parse(metadata);
    } else {
      piedmeta = {
        pixiv: {},
        inkbunny: {}
      };
      api.fileWrite(metafile, JSON.stringify(piedmeta));
    }
    if (piedmeta.inkbunny[param.userId]) {
      pos = piedmeta.inkbunny[param.userId];
    } else {
      piedmeta.inkbunny[param.userId] = 0;
    }

    let res = await api.webGet({
      url: 'https://inkbunny.net',
      cookie: data.inkbunny.cookie,
      proxy: param.proxy,
      timeout: 10
    });
    if (res.body.indexOf('/logout_process.php') == -1) {
      await app.evaluate(() => {
        logger('inkbunny', 'Try to logon to Inkbunny.');
      });
      if (!param.account || !param.password) {
        throw 'Account and password needed.';
      }
      res = await api.webGet({
        url: 'https://inkbunny.net/login.php',
        proxy: param.proxy,
        timeout: 10
      });
      let phpsessid = api.findCookie(res.headers['set-cookie'], 'PHPSESSID');
      let pg_login = cheerio.load(res.body);
      let token = pg_login('form[action="login_process.php"] input[name="token"]').val();
      res = await api.webPost({
        url: 'https://inkbunny.net/login_process.php',
        body: {
          username: param.account,
          password: param.password,
          token: token
        },
        cookie: phpsessid,
        proxy: param.proxy,
        timeout: 10
      });
      phpsessid = api.findCookie(res.headers['set-cookie'], 'PHPSESSID');
      res = await api.webGet({
        url: 'https://inkbunny.net',
        cookie: phpsessid,
        proxy: param.proxy,
        timeout: 10
      });
      if (res.body.indexOf('/logout_process.php') == -1) {
        throw 'Login failed.';
      } else {
        data.inkbunny.account = param.account;
        data.inkbunny.password = param.password;
        data.inkbunny.cookie = phpsessid;
        api.fileWrite(configFile, JSON.stringify(data));
        await app.evaluate(() => {
          logger('inkbunny', 'Login succeeded.');
        });
      }
    }

    res = await api.webGet({
      url: 'https://inkbunny.net/gallery/' + param.userId,
      cookie: data.inkbunny.cookie,
      proxy: param.proxy,
      timeout: 20
    });
    let pg_home = cheerio.load(res.body);
    let code = res.request.href.substring(res.request.href.lastIndexOf('/') + 1);
    let pageCount = 1;
    let pagerBox = pg_home('.bottomPaginatorBox');
    if (pagerBox.length > 0) {
      let pager = pagerBox.find('span').first().find('span').eq(1).find('span').text().split(' ');
      pageCount = parseInt(pager[pager.length - 1]);
    }
    let list = new Array();
    for (let i = 1; i <= pageCount; i++) {
      let pg;
      if (i == 1) {
        pg = pg_home;
      } else {
        res = await api.webGet({
          url: 'https://inkbunny.net/gallery/' + param.userId + '/' + i + '/' + code,
          cookie: data.inkbunny.cookie,
          proxy: param.proxy,
          timeout: 20
        });
        pg = cheerio.load(res.body);
      }
      let posFlag = false;
      pg('.widget_imageFromSubmission').each((i, elem) => {
        let cg = {};
        let link = cheerio(elem).find('a');
        cg.id = parseInt(link.attr('href').substring(link.attr('href').lastIndexOf('/') + 1));
        if (cg.id <= pos) {
          posFlag = true;
          return false;
        }
        cg.count = 1;
        if (link.find('div').length > 1) {
          cg.count = parseInt(link.find('div').eq(1).text().substring(1));
        }
        list.unshift(cg);
      });
      if (posFlag) {
        break;
      }
    }

    for (let i = 0; i < list.length; i++) {
      if (cancelFlags['inkbunny']) {
        break;
      }
      await app.evaluate((progress) => {
        $('#inkbunnyProgress').text(progress);
      }, i + ' / ' + list.length);
      let cg = list[i];
      let mask = Math.max((cg.count - 1).toString().length, 2);
      for (let j = 0; j < cg.count; j++) {
        if (cancelFlags['inkbunny']) {
          break;
        }
        if (cg.count > 1) {
          await app.evaluate(progress => {
            $('#inkbunnyProgress').text(progress);
          }, i + ' / ' + list.length + ' | ' + j + ' / ' + cg.count);
        }
        let url = 'https://inkbunny.net/s/' + cg.id;
        if (j > 0) {
          url = url + '-p' + (j + 1);
        }
        res = await api.webGet({
          url: url,
          cookie: data.inkbunny.cookie,
          proxy: param.proxy,
          timeout: 10
        });
        let pg_cg = cheerio.load(res.body);
        let elem = pg_cg('div.content.magicboxParent').find('.shadowedimage');
        let fileUrl;
        if (elem.length > 0) {
          fileUrl = elem.first().attr('src').replace('screen', 'full')
        } else {
          elem = pg_cg('div.content.magicboxParent').find('embed[type="application/x-shockwave-flash"]');
          fileUrl = elem.first().attr('src');
        }
        let ext = fileUrl.substring(fileUrl.lastIndexOf('.'));
        let fileName = cg.id.toString();
        if (cg.count > 1) {
          fileName = fileName + '_' + api.num2mask(j, mask);
        }
        fileName = fileName + ext;
        fileName = path.join(param.savePath, fileName);
        if (!fs.existsSync(fileName)) {
          await api.webDownload({
            url: fileUrl,
            fileName: fileName,
            cookie: data.inkbunny.cookie,
            proxy: param.proxy,
            timeout: 120
          });
        }
        if (cg.count > 1) {
          await app.evaluate(progress => {
            $('#inkbunnyProgress').text(progress);
          }, i + ' / ' + list.length + ' | ' + (j + 1) + ' / ' + cg.count);
        }
      }
      if (!cancelFlags['inkbunny']) {
        piedmeta.inkbunny[param.userId] = cg.id;
        api.fileWrite(metafile, JSON.stringify(piedmeta));
        await app.evaluate(progress => {
          $('#inkbunnyProgress').text(progress);
        }, (i + 1) + ' / ' + list.length);
      }
    }

    data.inkbunny.proxy = param.proxy;
  } catch (error) {
    await app.evaluate(_error => {
      logger('inkbunny', 'Error: ' + JSON.stringify(_error));
    }, error);
  }
  await app.evaluate(() => {
    busyFlags['inkbunny'] = false;
    logger('inkbunny', 'Task done.');
  });
};

var startExhentaiTask = async function (param) {
  try {
    let res;
    if (!data.exhentai.cookie) {
      await app.evaluate(() => {
        logger('exhentai', 'Try to logon on to Exhentai.');
      });
      if (!param.account || !param.password) {
        throw 'Account and password needed.';
      }
      res = await api.webPost({
        url: 'https://forums.e-hentai.org/index.php',
        body: {
          act: 'Login',
          CODE: '01',
          referer: 'act%3DLogin%26CODE%3D01',
          CookieDate: '1',
          UserName: param.account,
          PassWord: param.password,
          submit: 'Log+In'
        },
        proxy: param.proxy,
        timeout: 20
      });
      let ipb_member_id = api.findCookie(res.headers['set-cookie'], 'ipb_member_id');
      let ipb_pass_hash = api.findCookie(res.headers['set-cookie'], 'ipb_pass_hash');
      if (!ipb_member_id || !ipb_pass_hash) {
        throw 'Login failed.';
      } else {
        data.exhentai.account = param.account;
        data.exhentai.password = param.password;
        data.exhentai.cookie = ipb_member_id + ipb_pass_hash;
        api.fileWrite(configFile, JSON.stringify(data));
        await app.evaluate(() => {
          logger('exhentai', 'Login succeeded.');
        });
      }
    }

    res = await api.webGet({
      url: param.gallery,
      cookie: data.exhentai.cookie,
      proxy: param.proxy,
      timeout: 10
    });
    let pg = cheerio.load(res.body);
    let total = parseInt(pg('td.gdt2').eq(5).text().split(' ')[0]);
    let mask = Math.max(total.toString().length, 2);
    let page = 0;
    let list = new Array();
    while (true) {
      if (page > 0) {
        res = await api.webGet({
          url: param.gallery + '?p=' + page,
          cookie: data.exhentai.cookie,
          proxy: param.proxy,
          timeout: 10
        });
        pg = cheerio.load(res.body);
      }
      pg('div#gdt').find('a').each((i, elem) => {
        list.push(cheerio(elem).attr('href'));
      });
      let pager = pg('p.gpc').first().text().split(' ');
      if (pager[3] == pager[5]) {
        break;
      }
      page++;
    }

    for (let i = 0; i < list.length; i++) {
      if (cancelFlags['exhentai']) {
        break;
      }
      await app.evaluate((progress) => {
        $('#exhentaiProgress').text(progress);
      }, i + ' / ' + list.length);
      res = await api.webGet({
        url: list[i],
        cookie: data.exhentai.cookie,
        proxy: param.proxy,
        timeout: 10
      });
      let pg_img = cheerio.load(res.body);
      let fileName = api.num2mask(i + 1, mask) + '_';
      let fileUrl;
      let elem = pg_img('div#i7 a');
      if (elem.length == 0) {
        fileUrl = pg_img('img#img').attr('src');
        let name = pg_img('div#i4').find('div').first().text();
        fileName = fileName + name.substring(0, name.indexOf(' '));
      } else {
        fileUrl = elem.first().attr('href').replace('&amp;', '&');
        res = await api.webHead({
          url: fileUrl,
          cookie: data.exhentai.cookie,
          proxy: param.proxy,
          timeout: 10
        });
        let name = res.headers['content-disposition'];
        fileName = fileName + name.substring(name.indexOf('=') + 1);
      }
      fileName = path.join(param.savePath, fileName);
      if (!fs.existsSync(fileName)) {
        await api.webDownload({
          url: fileUrl,
          fileName: fileName,
          cookie: data.exhentai.cookie,
          proxy: param.proxy,
          timeout: 120
        });
      }
      await app.evaluate(progress => {
        $('#exhentaiProgress').text(progress);
      }, (i + 1) + ' / ' + list.length);
    }

    data.exhentai.proxy = param.proxy;
  } catch (error) {
    await app.evaluate(_error => {
      logger('exhentai', 'Error: ' + JSON.stringify(_error));
    }, error);
  }
  await app.evaluate(() => {
    busyFlags['exhentai'] = false;
    logger('exhentai', 'Task done.');
  });
};