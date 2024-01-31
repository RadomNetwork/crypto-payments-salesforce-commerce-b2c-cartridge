
/**
 * Create the jQuery Radom payment checkout Plugin.
 *
 * This jQuery plugin will be registered on the dom element in checkout.isml *
 * The radom plugin will handle the radom checkout payment.
 *
 */
(function ($) {

    // Pay With Crypto Currency
    $('body').on('click', '.btn.payWith-crypto', function () {
        // disable the next:Place Order button here

        var billingAddressForm = $('#dwfrm_billing .billing-address-block :input').serialize();

        $('body').trigger('checkout:serializeBilling', {
            form: $('#dwfrm_billing .billing-address-block'),
            data: billingAddressForm,
            callback: function (data) {
                if (data) {
                    billingAddressForm = data;
                }
            }
        });

        var contactInfoForm = $('#dwfrm_billing .contact-info-block :input').serialize();

        $('body').trigger('checkout:serializeBilling', {
            form: $('#dwfrm_billing .contact-info-block'),
            data: contactInfoForm,
            callback: function (data) {
                if (data) {
                    contactInfoForm = data;
                }
            }
        });

        var activeTabId = $('.tab-pane.active').attr('id');
        var paymentInfoSelector = '#dwfrm_billing .' + activeTabId + ' .payment-form-fields :input';
        var paymentInfoForm = $(paymentInfoSelector).serialize();

        $('body').trigger('checkout:serializeBilling', {
            form: $(paymentInfoSelector),
            data: paymentInfoForm,
            callback: function (data) {
                if (data) {
                    paymentInfoForm = data;
                }
            }
        });

        var paymentForm = billingAddressForm + '&' + contactInfoForm + '&' + paymentInfoForm;

        var action = $(this).data('action');

        //submit the form for radom session creation.
        $.ajax({
            url: action,
            type: 'post',
            data: paymentForm,
            success: function (data) {
                $('body').trigger('checkout:openPaymentGateway', data);
            },
            error: function (err) {
                console.error('Error Calling Controller ' + err);
                $('.error-message').show();
                $('.error-message-text').text(err.responseJSON.message);
            }
        });
    });

    //For Tab switiching disabled/enabled of place order button

    //disable placeorder button if radom payment method selected
    $('.radom-tab').on('click', function () {
        $('body').trigger('checkout:disableButton', '.next-step-button button');
    })

    //enable placeorder button if radom payment method not selected
    $('.credit-card-tab').on('click', function () {
        $('body').trigger('checkout:enableButton', '.next-step-button button');
    })

}(jQuery));

var exports = {

    //handle the response of radom checkout session api
    openPaymentGateway: function (params) {
        $('body').on('checkout:openPaymentGateway', function (e, data) {
            let session = null;
            if (data.success && data.response) {
                session = JSON.parse(data.response);

                //redirect to radom checkout session page 
                window.location.href = session.checkoutSessionUrl;
            } else {

                //throw error if api response has error.
                console.error('Error creating checkout session: ' + data.response);
                $('.error-message').show();
                if(data.response.fieldError || data.response.cartError)
                {
                    $('.error-message-text').text(err.responseJSON.message);
                } else {
                    $('.error-message-text').text(JSON.parse(data.response.errorMessage).error);
                }
                
            }

        });

    },
}

module.exports = exports;
