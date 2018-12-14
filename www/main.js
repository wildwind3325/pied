var busyFlags = {
    'pixiv': false,
    'inkbunny': false,
    'exhentai': false
};

var init = async function () {
    document.oncontextmenu = function () {
        return false;
    };
};

var submitTask = function (name) {
    if (busyFlags[name]) {
        weui.alert('Module [' + name + '] is busy.');
        return;
    }
    let param = getFormObj(name);
    if (!param.savePath) {
        weui.alert('Save path cannot be empty.');
        return;
    }
    busyFlags[name] = true;
    invokeHybrid(name + 'NewTask', param);
    logger(name, 'Task started.');
};

var cancelTask = function (name) {
    if (!busyFlags[name]) {
        return;
    }
    invokeHybrid(name + 'CancelTask');
    logger(name, 'Cancel current task.');
}

var logger = function (name, message) {
    $('#' + name + 'Console').append(message + '\r\n');
    $('#' + name + 'Console').scrollTop($('#' + name + 'Console')[0].scrollHeight);
};