'use-strict';

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const serviceID = 'radom';

/**
 * createCheckoutSession
 * @param {string} serviceID service id
 * @param {Object} config object for service configuration.
 */
let createCheckoutSession = LocalServiceRegistry.createService(serviceID, {
    createRequest: function (service, args) {
        
        const api_Data = CustomObjectMgr.getCustomObject('radom_API_checkout_data', 'api_data').getCustom();

        const token = api_Data ? api_Data['radom_API_Token'] : null;
      
        service.setRequestMethod('POST');
        service.addHeader('Authorization', token );
        service.addHeader('Content-type', 'application/json');
        return JSON.stringify(args);
    },
    parseResponse: function (service, result) {
        return result.text;
    },
    getRequestLogMessage: function (request) {
        return request;
    },
    getResponseLogMessage: function (response) {
        try {
            var r = {
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
                errorText: response.errorText,
                text: response.text
            };

            return JSON.stringify(r);
        } catch (e) {
            var err = 'failure to generate full response of checkout session: ' + response ? JSON.stringify(response) : '';
            return err;
        }
    }
});

module.exports = {
    createCheckoutSession: createCheckoutSession
};