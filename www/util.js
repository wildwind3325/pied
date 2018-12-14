var getFormObj = function (form) {
  var formObj = {};
  var fm = $('#' + form).serializeArray();
  for (var i = 0; i < fm.length; i++) {
    if (eval('formObj.' + fm[i].name)) {
      eval('formObj.' + fm[i].name + ' += \',\' + fm[i].value;');
    } else {
      eval('formObj.' + fm[i].name + ' = fm[i].value;');
    }
  }
  return formObj;
};

var setFormObj = function (form, obj) {
  var fm = $('#' + form);
  $.each(obj, function (name, value) {
    var input = fm.find(':input [name="' + name + '"]');
    if (input) {
      fm.find('[name="' + name + '"]').val(value);
    }
  });
};