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
const sha256Sync = require('sha256Sync');

const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;

const eventData = getAllEventData();
let url = eventData.page_location;

if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    return data.gtmOnSuccess();
}

let fbc = getCookieValues('_fbc')[0];
let fbp = getCookieValues('_fbp')[0];

if (!fbc) fbc = eventData._fbc;
if (!fbp) fbp = eventData._fbp;

if (!fbc) {
    if (url && url.indexOf('fbclid=') !== -1) {
        fbc = 'fb.1.' + getTimestampMillis() + '.' + url.split('fbclid=')[1].split('&')[0];
    }
}


const apiVersion = '12.0';
const postUrl = 'https://graph.facebook.com/v' + apiVersion + '/' + enc(data.pixelId) + '/events?access_token=' + enc(data.accessToken);
let postBody = 'data=' + enc(JSON.stringify([mapEvent(eventData, data)]));

if (data.testId) {
    postBody += '&test_event_code=' + enc(data.testId);
}

sendHttpRequest(postUrl, (statusCode, headers, body) => {
    if (statusCode >= 200 && statusCode < 400) {
        if (fbc) {
            setCookie('_fbc', fbc, {
                domain: 'auto',
                path: '/',
                samesite: 'Lax',
                secure: true,
                'max-age': 63072000, // 2 years
                httpOnly: false
            });
        }

        if (fbp) {
            setCookie('_fbp', fbp, {
                domain: 'auto',
                path: '/',
                samesite: 'Lax',
                secure: true,
                'max-age': 63072000, // 2 years
                httpOnly: false
            });
        }

        data.gtmOnSuccess();
    } else {
        data.gtmOnFailure();
    }
}, {headers: {content_type: 'application/x-www-form-urlencoded'}, method: 'POST', timeout: 3500}, postBody);


function getEventName(data) {
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

function mapEvent(eventData, data) {
    let eventName = getEventName(data);

    let mappedData = {
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

    if (fbc) mappedData.user_data.fbc = fbc;
    if (fbp) mappedData.user_data.fbp = fbp;

    mappedData = addServerEventData(eventData, data, mappedData);
    mappedData = addUserData(eventData, mappedData);
    mappedData = addEcommerceData(eventData, mappedData);
    mappedData = overrideDataIfNeeded(data, mappedData);
    mappedData = cleanupData(mappedData);
    mappedData = hashDataIfNeeded(mappedData);

    if (isDebug) {
        logToConsole('Event raw data: ', eventData);
        logToConsole('Facebook mapped data: ', mappedData);
        logToConsole('Facebook test_event_code: ', data.testId);
    }

    return mappedData;
}


function enc(data) {
    data = data || '';
    return encodeUriComponent(data);
}

function isHashed(value) {
    if (!value) {
        return false;
    }

    return value.match('^[A-Fa-f0-9]{64}$') !== null;
}


function hashData(value) {
    if (!value) {
        return value;
    }

    if (isHashed(value)) {
        return value;
    }

    return sha256Sync(value.trim().toLowerCase(), {outputEncoding: 'hex'});
}


function hashDataIfNeeded(mappedData) {
    if (mappedData.user_data) {
        for (let key in mappedData.user_data) {
            if (key === 'em' || key === 'ph' || key === 'ge' || key === 'db' || key === 'ln' || key === 'fn' || key === 'ct' || key === 'st' || key === 'zp' || key === 'country') {
                mappedData.user_data[key] = hashData(mappedData.user_data[key]);
            }
        }
    }

    return mappedData;
}

function overrideDataIfNeeded(data, mappedData) {
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

    return mappedData;
}

function cleanupData(mappedData) {
    if (mappedData.user_data) {
        let userData = {};

        for(let userDataKey in mappedData.user_data) {
            if (mappedData.user_data[userDataKey]) {
                userData[userDataKey] = mappedData.user_data[userDataKey];
            }
        }

        mappedData.user_data = userData;
    }

    if (mappedData.custom_data) {
        let customData = {};

        for(let customDataKey in mappedData.custom_data) {
            if (mappedData.custom_data[customDataKey]) {
                customData[customDataKey] = mappedData.custom_data[customDataKey];
            }
        }

        mappedData.custom_data = customData;
    }

    return mappedData;
}

function addEcommerceData(eventData, mappedData) {
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
    else if (eventData['x-ga-mp1-tr']) mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
    else if (eventData.value) mappedData.custom_data.value = eventData.value;

    if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
    if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;


    if (mappedData.event_name === 'Purchase') {
        if (!mappedData.custom_data.currency) {
            mappedData.custom_data.currency = 'USD';
        }
        if (!mappedData.custom_data.value) {
            mappedData.custom_data.value = 0;
        }
    }

    return mappedData;
}

function addUserData(eventData, mappedData) {
    if (eventData.fb_login_id) mappedData.user_data.fb_login_id = eventData.fb_login_id;

    if (eventData.external_id) mappedData.user_data.external_id = eventData.external_id;
    else if (eventData.user_id) mappedData.user_data.external_id = eventData.user_id;
    else if (eventData.userId) mappedData.user_data.external_id = eventData.userId;

    if (eventData.subscription_id) mappedData.user_data.subscription_id = eventData.subscription_id;
    else if (eventData.subscriptionId) mappedData.user_data.subscription_id = eventData.subscriptionId;

    if (eventData.lead_id) mappedData.user_data.lead_id = eventData.lead_id;
    else if (eventData.leadId) mappedData.user_data.lead_id = eventData.leadId;

    if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
    else if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
    else if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.last_name) mappedData.user_data.ln = eventData.user_data.address.last_name;

    if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
    else if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
    else if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.first_name) mappedData.user_data.fn = eventData.user_data.address.first_name;

    if (eventData.email) mappedData.user_data.em = eventData.email;
    else if (eventData.user_data && eventData.user_data.email_address) mappedData.user_data.em = eventData.user_data.email_address;

    if (eventData.phone) mappedData.user_data.ph = eventData.phone;
    else if (eventData.user_data && eventData.user_data.phone_number) mappedData.user_data.ph = eventData.user_data.phone_number;

    if (eventData.city) mappedData.user_data.ct = eventData.city;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.city) mappedData.user_data.ct = eventData.user_data.address.city;

    if (eventData.state) mappedData.user_data.st = eventData.state;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.region) mappedData.user_data.st = eventData.user_data.address.region;

    if (eventData.zip) mappedData.user_data.zp = eventData.zip;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.postal_code) mappedData.user_data.zp = eventData.user_data.address.postal_code;

    if (eventData.countryCode) mappedData.user_data.country = eventData.countryCode;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.country) mappedData.user_data.country = eventData.user_data.address.country;

    if (eventData.gender) mappedData.user_data.ge = eventData.gender;
    if (eventData.db) mappedData.user_data.db = eventData.db;

    return mappedData;
}


function addServerEventData(eventData, data, mappedData) {
    let serverEventDataList = {};

    if (eventData.transaction_id) mappedData.event_id = eventData.transaction_id;

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

    return mappedData;
}
