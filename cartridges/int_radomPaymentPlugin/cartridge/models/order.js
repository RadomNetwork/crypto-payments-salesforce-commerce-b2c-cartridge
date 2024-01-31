'use strict';

var base = module.superModule;

/**
 * Order class that represents the current order
 * extend order modal of base to add radom payment details
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket/order
 * @param {Object} options - The current order's line items
 * @constructor
 */
function OrderModel(lineItemContainer, options) {
    base.call(this, lineItemContainer, options);
    
    //add property name radom_webhook_data for webhook data 
    if (Object.prototype.hasOwnProperty.call(lineItemContainer.custom, 'radom_webhook_data')) {
        this.webhook_data = JSON.parse(lineItemContainer.custom.radom_webhook_data);
    }
}

OrderModel.prototype = Object.create(base.prototype);

module.exports = OrderModel;