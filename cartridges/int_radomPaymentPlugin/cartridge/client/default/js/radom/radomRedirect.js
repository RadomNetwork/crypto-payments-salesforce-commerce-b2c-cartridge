/**
 * Create the jQuery Radom payment Success Plugin.
 *
 * This jQuery plugin will be registered on the dom element in radomSuccess.isml *
 * The radom plugin will handle after radom paymet successfully handled and rdirect to success page(Order-Confirm).
 *
 */
(function ($) {
    $('.successLoader').fadeOut(1000, function () {
        var continueUrl = $('.order-radom-confirm').data('continueurl');
        var orderID = $('.order-radom-confirm').data('orderid');
        var orderToken = $('.order-radom-confirm').data('ordertoken');

        var redirect = $('<form>')
            .appendTo(document.body)
            .attr({
                method: 'POST',
                action: continueUrl
            });

        $('<input>')
            .appendTo(redirect)
            .attr({
                name: 'orderID',
                value: orderID
            })
            .css('display','none');

        $('<input>')
            .appendTo(redirect)
            .attr({
                name: 'orderToken',
                value: orderToken
            })
            .css('display','none');

        //submit form to Order-Confirm
        redirect.submit();
    });


    // eslint-disable-next-line no-undef
}(jQuery));

