
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const Math = require('Math');
const sendHttpRequest = require('sendHttpRequest');
const getTimestampMillis = require('getTimestampMillis');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');

const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;
const eventData = getAllEventData();

let fbc = getCookieValues('_fbc')[0];
const fbp = getCookieValues('_fbp')[0];

if (!fbc) {
    let url = eventData.page_location;

    if (url.indexOf('fbclid=') !== -1) {
        fbc = 'fb.1.' + getTimestampMillis() + '.' + url.split('fbclid=')[1].split('&')[0];
    }
}


const apiVersion = '10.0';
const postUrl = 'https://graph.facebook.com/v' + apiVersion + '/' + enc(data.pixelId) + '/events?access_token=' + enc(data.accessToken);
let postBody = 'data=' + enc(JSON.stringify([mapEvent()]));

if (data.testId) {
    postBody += '&test_event_code=' + enc(data.testId);
}

sendHttpRequest(postUrl, (statusCode, headers, body) => {
    if (statusCode >= 200 && statusCode < 400) {
        if (fbc) {
            setCookie('_fbc', fbc, {
                domain: 'auto',
                path: '/',
                'max-age': 15552000, // 6 month
                samesite: 'Lax',
                secure: true
            });
        }

        if (fbp) {
            setCookie('_fbp', fbp, {
                domain: 'auto',
                path: '/',
                'max-age': 15552000, // 6 month
                samesite: 'Lax',
                secure: true
            });
        }

        data.gtmOnSuccess();
    } else {
        data.gtmOnFailure();
    }
}, {headers: {content_type: 'application/x-www-form-urlencoded'}, method: 'POST', timeout: 3500}, postBody);


function getEventName() {
    if (data.inheritEventName === 'inherit') {
        let eventName = eventData.event_name;

        let gaToFacebookEventName = {
            'page_view': 'PageView',
            'add_payment_info': 'AddPaymentInfo',
            'add_to_cart': 'AddToCart',
            'add_to_wishlist': 'AddToWishlist',
            'sign_up': 'CompleteRegistration',
            'begin_checkout': 'InitiateCheckout',
            'generate_lead': 'Lead',
            'purchase': 'Purchase',
            'search': 'Search',
            'view_item': 'ViewContent',

            'contact': 'Contact',
            'customize_product': 'CustomizeProduct',
            'donate': 'Donate',
            'find_location': 'FindLocation',
            'schedule': 'Schedule',
            'start_trial': 'StartTrial',
            'submit_application': 'SubmitApplication',
            'subscribe': 'Subscribe',

            'gtm4wp.addProductToCartEEC': 'AddToCart',
            'gtm4wp.productClickEEC': 'ViewContent',
            'gtm4wp.checkoutOptionEEC': 'InitiateCheckout',
            'gtm4wp.checkoutStepEEC': 'AddPaymentInfo',
            'gtm4wp.orderCompletedEEC': 'Purchase'
        };

        if (!gaToFacebookEventName[eventName]) {
            return eventName;
        }

        return gaToFacebookEventName[eventName];
    }

    return data.eventName === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent() {
    let eventName = getEventName();

    const mappedData = {
        event_name: eventName,
        action_source: 'website',
        event_source_url: eventData.page_location,
        event_time: Math.floor(getTimestampMillis() / 1000),
        custom_data: {},
        user_data: {
            client_ip_address: eventData.ip_override,
            client_user_agent: eventData.user_agent,
        }
    };

    if (eventData.transaction_id) mappedData.event_id = eventData.transaction_id;

    let serverEventDataList = [];
    if (data.serverEventDataList) {
        data.serverEventDataList.forEach(d => {
            serverEventDataList[d.name] = d.value;
        });
    }

    if (serverEventDataList) {
        if (serverEventDataList.action_source) mappedData.action_source = serverEventDataList.action_source;
        if (serverEventDataList.event_time) mappedData.event_time = serverEventDataList.event_time;
        if (serverEventDataList.event_source_url) mappedData.event_source_url = serverEventDataList.event_source_url;
        if (serverEventDataList.opt_out) mappedData.opt_out = serverEventDataList.opt_out;
        if (serverEventDataList.event_id) mappedData.event_id = serverEventDataList.event_id;

        if (serverEventDataList.data_processing_options) {
            mappedData.data_processing_options = serverEventDataList.data_processing_options;

            if (serverEventDataList.data_processing_options_country) mappedData.data_processing_options_country = serverEventDataList.data_processing_options_country;
            if (serverEventDataList.data_processing_options_state) mappedData.data_processing_options_state = serverEventDataList.data_processing_options_state;
        }
    }

    //
    // User data
    //
    if (fbc) mappedData.user_data.fbc = fbc;
    if (fbp) mappedData.user_data.fbp = fbp;

    if (eventData.fb_login_id) mappedData.user_data.fb_login_id = eventData.fb_login_id;

    if (eventData.external_id) mappedData.user_data.external_id = eventData.external_id;
    if (eventData.user_id) mappedData.user_data.external_id = eventData.user_id;
    if (eventData.userId) mappedData.user_data.external_id = eventData.userId;

    if (eventData.subscription_id) mappedData.user_data.subscription_id = eventData.subscription_id;
    if (eventData.subscriptionId) mappedData.user_data.subscription_id = eventData.subscriptionId;

    if (eventData.lead_id) mappedData.user_data.lead_id = eventData.lead_id;
    if (eventData.leadId) mappedData.user_data.lead_id = eventData.leadId;

    if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
    if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
    if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;

    if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
    if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
    if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;

    if (eventData.email) mappedData.user_data.em = eventData.email;
    if (eventData.phone) mappedData.user_data.ph = eventData.phone;
    if (eventData.gender) mappedData.user_data.ge = eventData.gender;
    if (eventData.city) mappedData.user_data.ct = eventData.city;
    if (eventData.state) mappedData.user_data.st = eventData.state;
    if (eventData.zip) mappedData.user_data.zp = eventData.zip;
    if (eventData.countryCode) mappedData.user_data.country = eventData.countryCode;


    //
    // Custom data
    //
    if (eventData.items && eventData.items[0]) {
        mappedData.custom_data.contents = {};
        mappedData.custom_data.content_type = 'product';

        if (!eventData.items[1]) {
            if (eventData.items[0].item_name) mappedData.custom_data.content_name = eventData.items[0].item_name;
            if (eventData.items[0].item_category) mappedData.custom_data.content_category = eventData.items[0].item_category;
        }

        eventData.items.forEach((d,i) => {
            mappedData.custom_data.contents[i] = {
                'id': d.item_id,
                'quantity': d.quantity,
                'item_price': d.price,
            };
        });
    }

    if (eventData['x-ga-mp1-ev']) mappedData.custom_data.value = eventData['x-ga-mp1-ev'];
    if (eventData['x-ga-mp1-tr']) mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
    if (eventData.value) mappedData.custom_data.value = eventData.value;

    if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
    if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;


    if (eventName === 'Purchase') {
        if (!mappedData.custom_data.currency) {
            mappedData.custom_data.currency = 'USD';
        }
        if (!mappedData.custom_data.value) {
            mappedData.custom_data.value = 0;
        }
    }


    //
    // Overriding
    //
    if (data.userDataList) {
        data.userDataList.forEach(d => {
            mappedData.user_data[d.name] = d.value;
        });
    }

    if (data.customDataList) {
        data.customDataList.forEach(d => {
            mappedData.custom_data[d.name] = d.value;
        });
    }

    if (isDebug) {
        logToConsole('Event raw data: ', eventData);
        logToConsole('Facebook mapped data: ', mappedData);
    }

    return mappedData;
}


function enc(data) {
    data = data || '';
    return encodeUriComponent(data);
}
