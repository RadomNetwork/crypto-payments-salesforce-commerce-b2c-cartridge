'use-strict';

const server = require('server');
const service = require('*/cartridge/scripts/services/radomRestService');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
let Resource = require('dw/web/Resource');
let HookManager = require('dw/system/HookMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var OrderModel = require('*/cartridge/models/order');
var OrderMgr = require('dw/order/OrderMgr');
let COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

/**
 * Radom-PaymentStart : This endpoint is invoked when user select payment with crypto
 * @name Base/Radom-PaymentStart
 * @function
 * @memberof Radom
 * @param {serverfunction} - post
 */
server.post('PaymentStart', function (req, res, next) {
  let viewData = {};
  let paymentForm = server.forms.getForm('billing');

  // verify billing form data
  let billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
  let contactInfoFormErrors = COHelpers.validateFields(paymentForm.contactInfoFields);

  let formFieldErrors = [];
  if (Object.keys(billingFormErrors).length) {
    formFieldErrors.push(billingFormErrors);
  } else {
    viewData.address = {
      firstName: { value: paymentForm.addressFields.firstName.value },
      lastName: { value: paymentForm.addressFields.lastName.value },
      address1: { value: paymentForm.addressFields.address1.value },
      address2: { value: paymentForm.addressFields.address2.value },
      city: { value: paymentForm.addressFields.city.value },
      postalCode: { value: paymentForm.addressFields.postalCode.value },
      countryCode: { value: paymentForm.addressFields.country.value }
    };

    if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
      viewData.address.stateCode = { value: paymentForm.addressFields.states.stateCode.value };
    }
  }

  if (Object.keys(contactInfoFormErrors).length) {
    formFieldErrors.push(contactInfoFormErrors);
  } else {
    viewData.phone = { value: paymentForm.contactInfoFields.phone.value };
  }

  //for errors
  if (Object.keys(contactInfoFormErrors).length) {
    formFieldErrors.push(contactInfoFormErrors);
  } else {
    viewData.phone = { value: paymentForm.contactInfoFields.phone.value };
  }

  if (formFieldErrors.length) {
    // respond with form data and errors
    res.json({
      form: paymentForm,
      fieldErrors: formFieldErrors,
      fieldError: true
    });
    return next();
  }

  res.setViewData(viewData);

  this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
    var PaymentMgr = require('dw/order/PaymentMgr');
    var AccountModel = require('*/cartridge/models/account');
    var Locale = require('dw/util/Locale');

    var currentBasket = BasketMgr.getCurrentBasket();

    var billingData = res.getViewData();

    if (!currentBasket) {
      delete billingData.paymentInformation;

      res.json({
        error: true,
        cartError: true,
        fieldErrors: [],
        serverErrors: [],
        redirectUrl: URLUtils.url('Cart-Show').toString()
      });
      return;
    }

    var validatedProducts = validationHelpers.validateProducts(currentBasket);
    if (validatedProducts.error) {
      delete billingData.paymentInformation;

      res.json({
        error: true,
        cartError: true,
        fieldErrors: [],
        serverErrors: [],
        redirectUrl: URLUtils.url('Cart-Show').toString()
      });
      return;
    }

    var billingAddress = currentBasket.billingAddress;
    var billingForm = server.forms.getForm('billing');

    Transaction.wrap(function () {
      if (!billingAddress) {
        billingAddress = currentBasket.createBillingAddress();
      }

      billingAddress.setFirstName(billingData.address.firstName.value);
      billingAddress.setLastName(billingData.address.lastName.value);
      billingAddress.setAddress1(billingData.address.address1.value);
      billingAddress.setAddress2(billingData.address.address2.value);
      billingAddress.setCity(billingData.address.city.value);
      billingAddress.setPostalCode(billingData.address.postalCode.value);
      if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
        billingAddress.setStateCode(billingData.address.stateCode.value);
      }
      billingAddress.setCountryCode(billingData.address.countryCode.value);
      billingAddress.setPhone(billingData.phone.value);
    });

    // Calculate the basket
    Transaction.wrap(function () {
      basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-calculate the payments.
    var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
      currentBasket
    );

    if (calculatedPaymentTransaction.error) {
      res.json({
        form: paymentForm,
        fieldErrors: [],
        serverErrors: [Resource.msg('error.technical', 'checkout', null)],
        error: true
      });
      return;
    }

    var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
    if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
      req.session.privacyCache.set('usingMultiShipping', false);
      usingMultiShipping = false;
    }

    hooksHelper('app.customer.subscription', 'subscribeTo', [paymentForm.subscribe.checked, currentBasket.customerEmail], function () { });

    var currentLocale = Locale.getLocale(req.locale.id);
    
    var basketModel = new OrderModel(
      currentBasket,
      { usingMultiShipping: usingMultiShipping, countryCode: currentLocale.country, containerView: 'basket' }
    );

    var accountModel = new AccountModel(req.currentCustomer);
    var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
      req,
      accountModel
    );

    let totalPayemt = currentBasket.totalGrossPrice.value;

    //payment instrument
    var paymentMethodID = 'Radom';

    var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();

    // check to make sure there is a payment processor
    if (!processor) {
      throw new Error(Resource.msg(
        'error.payment.processor.missing',
        'checkout',
        null
      ));
    }

    if (HookManager.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
      result = HookManager.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
        'Handle',
        currentBasket,
        paymentMethodID,
        req
      );
    } else {
      res.json({
        serverErrors: 'Error in payment processor',
        error: true
      });
      return;
    }

    // need to invalidate credit card fields
    if (result.error) {
      res.json({
        form: billingForm,
        serverErrors: result.serverErrors,
        error: true
      });
      return;
    }

    //GET congiguration object
    const api_Data = CustomObjectMgr.getCustomObject('radom_API_checkout_data', 'api_data').getCustom();

    var sessionID = session.sessionID;

    //first check if there is already object then remove it
    var oldPaymentTransaction = CustomObjectMgr.queryCustomObjects('radom_API_checkout_data', 'custom.radom_API_checkout_data != {0} AND custom.radom_session_id = {1}', 'creationDate asc', 'api_data', sessionID);

    while(oldPaymentTransaction.hasNext())
    {
      var object = oldPaymentTransaction.next();

      Transaction.wrap(()=>{
           CustomObjectMgr.remove(object);
      });
    }

    var paymentTransaction;

    const date = new Date();
    Transaction.wrap(() => {
      paymentTransaction = CustomObjectMgr.createCustomObject('radom_API_checkout_data', sessionID + date.getTime());
      paymentTransaction.custom['radom_session_id'] = sessionID
    })


    // totalPayemt = 0.1;  

    var data = {
      "total": totalPayemt,
      "currency": currentBasket.currencyCode,
      "gateway": JSON.parse(api_Data.gateway),
      "successUrl": URLUtils.http(api_Data.successUrl).toString(),
      "cancelUrl": URLUtils.http(api_Data.cancelUrl).toString(),
      "metadata": [{
        "key": "checkout session",
        "value": paymentTransaction.custom['radom_API_checkout_data']
      }],
      "customizations": JSON.parse(api_Data.customizations),
      "chargeCustomerNetworkFee": api_Data['chargeCustomerNetworkFee'],
    };

    //add this attribute in data if want expire attribute
    // "expiresAt": 1706916760

    var response = service.createCheckoutSession.call(data);

    if (response.ok && response.object) {
      res.json({
        response: response.object,
        success: true
      });

    } else {
      res.json({
        response: {
          errorCode: response.error,
          errorMessage: response.errorMessage
        },
        success: false
      });
    }

  });

  next();
});

/**
 * Radom-Placeholder : This endpoint is invoked when the payment is completed in radom
 * @name Base/Radom-Placeholder
 * @function
 * @memberof Radom
 * @param {serverfunction} - get
 */
server.get('PlaceOrder', function (req, res, next) {
  var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');

  var currentBasket = BasketMgr.getCurrentBasket();

  if (!currentBasket) {
    res.render('radom/confirmation/radomFailure', {
      error: true,
      errorMessage: Resource.msg('error.technical', 'checkout', null)
    });

    return next();
  }

  //fetch payment session data 
  var radom_session_id = session.sessionID;
  var paymentTransaction = CustomObjectMgr.queryCustomObject('radom_API_checkout_data', 'custom.radom_session_id = {0}', radom_session_id);
  var order;

  if (paymentTransaction) {

    // Calculate the basket
    Transaction.wrap(function () {
      basketCalculationHelpers.calculateTotals(currentBasket);
    });


    //create order
    order = COHelpers.createOrder(currentBasket);

    if (!order) {
      res.render('radom/confirmation/radomFailure', {
        error: true,
        errorMessage: Resource.msg('error.technical', 'checkout', null)
      });

      return next();
    }

    var transaction = paymentTransaction.custom['radom_transaction_id'];
    var webhookData = paymentTransaction.custom['webhook_data'];

    if (transaction) {

      Transaction.wrap(() => {
        var parseWebhookData = JSON.parse(webhookData);

        order.custom.radom_transaction_id = transaction;
        order.custom.radom_webhook_data = webhookData;
        order.custom.transactionHash = parseWebhookData.eventData.managedPayment.transactions[0].transactionHash;
        order.custom.checkoutSessionId = parseWebhookData.radomData.checkoutSession.checkoutSessionId;
        order.custom.radom_token = parseWebhookData.eventData.managedPayment.paymentMethod.token;
        order.custom.radom_network = parseWebhookData.eventData.managedPayment.paymentMethod.network;

        order.setPaymentStatus(order.PAYMENT_STATUS_PAID);

        //remove session object 
        CustomObjectMgr.remove(paymentTransaction);
      });


      //save data in payment transaction
      // saved transaction = radom transaction id
      var handlePaymentResult = COHelpers.handlePayments(order, order.custom.radom_transaction_id);

      var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
      if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function () { OrderMgr.failOrder(order, true); });

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);

        res.render('radom/confirmation/radomFailure', {
          error: true,
          errorMessage: Resource.msg('error.technical', 'checkout', null)
        });

        return next();
      }

      // Places the order
      var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
      if (placeOrderResult.error) {
        res.render('radom/confirmation/radomFailure', {
          error: true,
          errorMessage: Resource.msg('error.technical', 'checkout', null)
        });

        return next();
      }

      if (req.currentCustomer.addressBook) {
        // save all used shipping addresses to address book of the logged in customer
        var allAddresses = addressHelpers.gatherShippingAddresses(order);
        allAddresses.forEach(function (address) {
          if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
            addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
          }
        });
      }

      if (order.getCustomerEmail()) {
        COHelpers.sendConfirmationEmail(order, req.locale.id);
      }

      // Reset usingMultiShip after successful Order placement
      req.session.privacyCache.set('usingMultiShipping', false);

      req.session.raw.custom.orderID = order.orderNo;
      req.session.raw.custom.orderToken = order.orderToken;

      res.render('radom/confirmation/radomSuccess', {
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
      });

    } else {
      res.json({
        error: true,
        errorStage: {
          stage: 'payment'
        },
        errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
      });
    }
  }

  next();
});

/**
 * Radom-Cancel : This endpoint is invoked when the payment is canceled or imcompleted event trigger in radom
 * @name Base/Radom-Cancel
 * @function
 * @memberof Radom
 * @param {serverfunction} - get
 */
server.get('Cancel', function (req, res, next) {
  //fetch payment session data 
  var radom_session_id = session.sessionID;
  var paymentTransaction = CustomObjectMgr.queryCustomObject('radom_API_checkout_data', 'custom.radom_session_id = {0}', radom_session_id);

  if (paymentTransaction) {

    //if webhook data exists then generate fail order and redirect to failure page.
    if (paymentTransaction.custom.webhook_data) {
      var currentBasket = BasketMgr.getCurrentBasket();

      if (!currentBasket) {

        res.render('radom/confirmation/radomFailure', {
          error: true,
          errorMessage: Resource.msg('error.technical', 'checkout', null)
        });

        return next();
      }

      //create order
      order = COHelpers.createOrder(currentBasket);

      //fail order
      Transaction.wrap(function () { OrderMgr.failOrder(order, true); });

      res.render('radom/confirmation/radomFailure', {
        error: true,
        errorMessage: Resource.msg('error.technical', 'checkout', null)
      });

      return next();
    }

    Transaction.wrap(() => {
      CustomObjectMgr.remove(paymentTransaction);
    });
  }
  // redirect to cart if payment back option triggered
  res.redirect(URLUtils.http('Cart-Show'));

  next();
})

/**
 * Radom-webhook : This endpoint is invoked when any event triggered in radom
 * @name Base/Radom-Cancel
 * @function
 * @memberof Radom
 * @param {serverfunction} - post
 */
server.post('webhook', function (req, res, next) {
  const api_Data = CustomObjectMgr.getCustomObject('radom_API_checkout_data', 'api_data').getCustom();

  const verificationKey = api_Data ? api_Data['radom_webhook_verification_key'] : null;

  //null check for verificationkey
  if (verificationKey != req.httpHeaders.get('radom-verification-key')) {
    return res.json({
      status: 401
    });
  } else {

    var responseData = JSON.parse(req.body);
    var UUID = responseData.radomData.checkoutSession.metadata[0].value;
    try {

      var custom_obj = CustomObjectMgr.getCustomObject('radom_API_checkout_data', UUID);

      if (custom_obj) {

        //save transaction id if payment completed successfully
        Transaction.wrap(() => {
          custom_obj.custom['radom_transaction_id'] = responseData.id;
          custom_obj.custom['webhook_data'] = req.body;
        });

      }
    } catch (e) {
      return res.json(e)
    }

    return res.json({
      status: 200
    });
  }

  next();
});


module.exports = server.exports();