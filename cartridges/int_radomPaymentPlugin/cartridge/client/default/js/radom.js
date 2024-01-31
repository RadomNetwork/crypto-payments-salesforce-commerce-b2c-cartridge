/* eslint-disable no-undef */
'use strict';

var processInclude = require('base/util');

$(document).ready(function () {
    processInclude(require('./radom/radom'));
    processInclude(require('./radom/radomRedirect'));
});
