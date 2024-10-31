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
const decodeUriComponent = require('decodeUriComponent');
const parseUrl = require('parseUrl');
const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const generateRandom = require('generateRandom');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const makeString = require('makeString');
const makeNumber = require('makeNumber');
const toBase64 = require('toBase64');
const fromBase64 = require('fromBase64');
const createRegex = require('createRegex');
const testRegex = require('testRegex');
const Promise = require('Promise');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');
const subDomainIndex = url
  ? computeEffectiveTldPlusOne(url).split('.').length - 1
  : 1;

if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const commonCookie = eventData.common_cookie || {};

let fbc = getCookieValues('_fbc')[0] || commonCookie._fbc;
let fbp = getCookieValues('_fbp')[0] || commonCookie._fbp;

if (!fbc) fbc = eventData._fbc;
if (!fbp) fbp = eventData._fbp;

if (url) {
  const urlParsed = parseUrl(url);

  if (urlParsed && urlParsed.searchParams.fbclid) {
    if (
      !fbc ||
      (fbc &&
        fbc.split('.')[fbc.split('.').length - 1] !==
          decodeUriComponent(urlParsed.searchParams.fbclid))
    ) {
      fbc =
        'fb.' +
        subDomainIndex +
        '.' +
        getTimestampMillis() +
        '.' +
        decodeUriComponent(urlParsed.searchParams.fbclid);
    }
  }
}

if (!fbp && data.generateFbp) {
  fbp =
    'fb.' +
    subDomainIndex +
    '.' +
    getTimestampMillis() +
    '.' +
    generateRandom(1000000000, 2147483647);
}

const mappedEventData = mapEvent(eventData, data);
const postBody = {
  data: [mappedEventData],
  partner_agent:
    'stape-gtmss-2.1.1' + (data.enableEventEnhancement ? '-ee' : '')
};

if (data.enableEventEnhancement) {
  mappedEventData.user_data = enhanceEventData(mappedEventData.user_data);
  setGtmEecCookie(mappedEventData.user_data);
}

if (eventData.test_event_code || data.testId) {
  postBody.test_event_code = eventData.test_event_code
    ? eventData.test_event_code
    : data.testId;
}

const cookieOptions = {
  domain: 'auto',
  path: '/',
  samesite: 'Lax',
  secure: true,
  'max-age': 7776000, // 90 days
  HttpOnly: !!data.useHttpOnlyCookie
};

if (fbc) {
  setCookie('_fbc', fbc, cookieOptions);
}

if (fbp) {
  setCookie('_fbp', fbp, cookieOptions);
}

const apiVersion = '20.0';
let pixelIdsAndAccessTokens = [
  { pixelId: data.pixelId, accessToken: data.accessToken }
];
if (data.enableMultipixelSetup) {
  pixelIdsAndAccessTokens = pixelIdsAndAccessTokens.concat(
    data.pixelIdAndAccessTokenTable
  );
}

const requests = pixelIdsAndAccessTokens.map((pixelIdAndAccessTokenObj) => {
  const pixelId = pixelIdAndAccessTokenObj.pixelId;
  const accessToken = pixelIdAndAccessTokenObj.accessToken;
  const postUrl =
    'https://graph.facebook.com/v' +
    apiVersion +
    '/' +
    enc(pixelId) +
    '/events?access_token=' +
    enc(accessToken);
  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'Facebook',
        Type: 'Request',
        TraceId: traceId,
        EventName: mappedEventData.event_name,
        RequestMethod: 'POST',
        RequestUrl: postUrl,
        RequestBody: postBody
      })
    );
  }
  return sendHttpRequest(
    postUrl,
    { headers: { 'content-type': 'application/json' }, method: 'POST' },
    JSON.stringify(postBody)
  );
});

Promise.all(requests).then((results) => {
  let someRequestFailed = false;

  results.forEach((result) => {
    if (isLoggingEnabled) {
      logToConsole(
        JSON.stringify({
          Name: 'Facebook',
          Type: 'Response',
          TraceId: traceId,
          EventName: mappedEventData.event_name,
          ResponseStatusCode: result.statusCode,
          ResponseHeaders: result.headers,
          ResponseBody: result.body
        })
      );
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      someRequestFailed = true;
    }
  });

  if (!data.useOptimisticScenario) {
    if (someRequestFailed) {
      data.gtmOnFailure();
    } else {
      data.gtmOnSuccess();
    }
  }
});

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

function getEventName(data) {
  if (data.inheritEventName === 'inherit') {
    let eventName = eventData.event_name;

    let gaToFacebookEventName = {
      page_view: 'PageView',
      'gtm.dom': 'PageView',
      add_payment_info: 'AddPaymentInfo',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      begin_checkout: 'InitiateCheckout',
      generate_lead: 'Lead',
      purchase: 'Purchase',
      search: 'Search',
      view_item: 'ViewContent',

      contact: 'Contact',
      customize_product: 'CustomizeProduct',
      donate: 'Donate',
      find_location: 'FindLocation',
      schedule: 'Schedule',
      start_trial: 'StartTrial',
      submit_application: 'SubmitApplication',
      subscribe: 'Subscribe',

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

  return data.eventName === 'standard'
    ? data.eventNameStandard
    : data.eventNameCustom;
}

function mapEvent(eventData, data) {
  let eventName = getEventName(data);

  let mappedData = {
    event_name: eventName,
    action_source: data.actionSource || 'website',
    event_time: Math.round(getTimestampMillis() / 1000),
    custom_data: {},
    user_data: {}
  };

  if (mappedData.action_source === 'app') {
    mappedData.app_data = {};
  }

  if (mappedData.action_source === 'business_messaging') {
    mappedData.messaging_channel = data.messaging_channel;
  }

  if (eventData.page_location)
    mappedData.event_source_url = eventData.page_location;
  if (eventData.user_agent)
    mappedData.user_data.client_user_agent = eventData.user_agent;

  if (eventData.ip_override) {
    mappedData.user_data.client_ip_address = eventData.ip_override
      .split(' ')
      .join('')
      .split(',')[0];
  }

  if (fbc) mappedData.user_data.fbc = fbc;
  if (fbp) mappedData.user_data.fbp = fbp;

  mappedData = addServerEventData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addAppData(eventData, mappedData);
  mappedData = addEcommerceData(eventData, mappedData);
  mappedData = overrideDataIfNeeded(mappedData);
  mappedData = cleanupData(mappedData);
  mappedData = hashDataIfNeeded(mappedData);

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

  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(key, value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'array') {
    return value.map((val) => {
      return hashData(key, val);
    });
  }

  if (isHashed(value)) {
    return value;
  }

  value = makeString(value).trim().toLowerCase();

  if (key === 'ph') {
    value = normalizePhoneNumber(value);
  } else if (key === 'ct') {
    value = value.split(' ').join('');
  }

  return sha256Sync(value, { outputEncoding: 'hex' });
}

function hashDataIfNeeded(mappedData) {
  if (mappedData.user_data) {
    const keysToHash = [
      'em',
      'ph',
      'ge',
      'db',
      'ln',
      'fn',
      'ct',
      'st',
      'zp',
      'country',
      'external_id'
    ];
    for (let key in mappedData.user_data) {
      if (keysToHash.indexOf(key) !== -1) {
        mappedData.user_data[key] = hashData(key, mappedData.user_data[key]);
      }
    }
  }

  return mappedData;
}

function overrideDataIfNeeded(mappedData) {
  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      mappedData.user_data[d.name] = d.value;
    });
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      mappedData.custom_data[d.name] = d.value;
    });
  }

  if (data.appDataList && mappedData.action_source === 'app') {
    data.appDataList.forEach((d) => {
      mappedData.app_data[d.name] = d.value;
    });
  }

  return mappedData;
}

function cleanupData(mappedData) {
  if (mappedData.user_data) {
    let userData = {};

    for (let userDataKey in mappedData.user_data) {
      if (isValidValue(mappedData.user_data[userDataKey])) {
        userData[userDataKey] = mappedData.user_data[userDataKey];
      }
    }

    mappedData.user_data = userData;
  }

  if (mappedData.custom_data) {
    let customData = {};

    for (let customDataKey in mappedData.custom_data) {
      if (isValidValue(mappedData.custom_data[customDataKey])) {
        customData[customDataKey] = mappedData.custom_data[customDataKey];
      }
    }

    if (customData.value === 0 || customData.value === '0')
      customData.value = '0.00';

    mappedData.custom_data = customData;
  }

  if (mappedData.app_data) {
    let appData = {};

    for (let appDataKey in mappedData.app_data) {
      if (isValidValue(mappedData.app_data[appDataKey])) {
        appData[appDataKey] = mappedData.app_data[appDataKey];
      }
    }

    mappedData.app_data = appData;
  }

  return mappedData;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}

function addEcommerceData(eventData, mappedData) {
  let currencyFromItems = '';
  let valueFromItems = 0;

  if (eventData.items && eventData.items[0]) {
    mappedData.custom_data.contents = [];
    mappedData.custom_data.content_type =
      eventData['x-fb-cd-content_type'] || eventData.content_type || 'product';
    currencyFromItems = eventData.items[0].currency;

    if (!eventData.items[1]) {
      if (eventData.items[0].item_name)
        mappedData.custom_data.content_name = eventData.items[0].item_name;
      if (eventData.items[0].item_category)
        mappedData.custom_data.content_category =
          eventData.items[0].item_category;

      if (eventData.items[0].price) {
        mappedData.custom_data.value = eventData.items[0].quantity
          ? eventData.items[0].quantity * eventData.items[0].price
          : eventData.items[0].price;
      }
    }

    const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
    eventData.items.forEach((d, i) => {
      let content = {};
      if (d[itemIdKey]) content.id = d[itemIdKey];
      if (d.item_name) content.title = d.item_name;
      if (d.item_brand) content.brand = d.item_brand;
      if (d.quantity) content.quantity = d.quantity;
      if (d.item_category) content.category = d.item_category;

      if (d.price) {
        content.item_price = makeNumber(d.price);
        valueFromItems += d.quantity
          ? d.quantity * content.item_price
          : content.item_price;
      }

      mappedData.custom_data.contents.push(content);
    });
  }

  if (eventData['x-ga-mp1-ev'])
    mappedData.custom_data.value = eventData['x-ga-mp1-ev'];
  else if (eventData['x-ga-mp1-tr'])
    mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
  else if (eventData.value) mappedData.custom_data.value = eventData.value;

  if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
  else if (currencyFromItems)
    mappedData.custom_data.currency = currencyFromItems;

  if (eventData.search_term)
    mappedData.custom_data.search_string = eventData.search_term;

  if (eventData.transaction_id)
    mappedData.custom_data.order_id = eventData.transaction_id;

  if (mappedData.event_name === 'Purchase') {
    if (!mappedData.custom_data.currency)
      mappedData.custom_data.currency = 'USD';
    if (!mappedData.custom_data.value)
      mappedData.custom_data.value = valueFromItems ? valueFromItems : 0;
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  let address = {};
  let user_data = {};
  if (getType(eventData.user_data) === 'object') {
    user_data = eventData.user_data;
    const addressType = getType(user_data.address);
    if (addressType === 'object' || addressType === 'array') {
      address = user_data.address[0] || user_data.address;
    }
  }
  if (eventData.fb_login_id)
    mappedData.user_data.fb_login_id = eventData.fb_login_id;

  if (eventData.anon_id) mappedData.user_data.anon_id = eventData.anon_id;

  if (eventData.madid) mappedData.user_data.madid = eventData.madid;

  if (eventData.external_id)
    mappedData.user_data.external_id = eventData.external_id;
  else if (eventData.user_id)
    mappedData.user_data.external_id = eventData.user_id;
  else if (eventData.userId)
    mappedData.user_data.external_id = eventData.userId;

  if (eventData.subscription_id)
    mappedData.user_data.subscription_id = eventData.subscription_id;
  else if (eventData.subscriptionId)
    mappedData.user_data.subscription_id = eventData.subscriptionId;

  if (eventData.lead_id) mappedData.user_data.lead_id = eventData.lead_id;
  else if (eventData.leadId) mappedData.user_data.lead_id = eventData.leadId;

  if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
  else if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
  else if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;
  else if (eventData.last_name) mappedData.user_data.ln = eventData.last_name;
  else if (user_data.last_name) mappedData.user_data.ln = user_data.last_name;
  else if (address.last_name) mappedData.user_data.ln = address.last_name;

  if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
  else if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
  else if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;
  else if (eventData.first_name) mappedData.user_data.fn = eventData.first_name;
  else if (user_data.first_name) mappedData.user_data.fn = user_data.first_name;
  else if (address.first_name) mappedData.user_data.fn = address.first_name;

  if (eventData.email) mappedData.user_data.em = eventData.email;
  else if (user_data.email_address)
    mappedData.user_data.em = user_data.email_address;
  else if (user_data.email) mappedData.user_data.em = user_data.email;

  if (eventData.phone) mappedData.user_data.ph = eventData.phone;
  else if (user_data.phone_number)
    mappedData.user_data.ph = user_data.phone_number;

  if (eventData.city) mappedData.user_data.ct = eventData.city;
  else if (address.city) mappedData.user_data.ct = address.city;

  if (eventData.state) mappedData.user_data.st = eventData.state;
  else if (eventData.region) mappedData.user_data.st = eventData.region;
  else if (user_data.region) mappedData.user_data.st = user_data.region;
  else if (address.region) mappedData.user_data.st = address.region;

  if (eventData.zip) mappedData.user_data.zp = eventData.zip;
  else if (eventData.postal_code)
    mappedData.user_data.zp = eventData.postal_code;
  else if (user_data.postal_code)
    mappedData.user_data.zp = user_data.postal_code;
  else if (address.postal_code) mappedData.user_data.zp = address.postal_code;

  if (eventData.countryCode)
    mappedData.user_data.country = eventData.countryCode;
  else if (eventData.country) mappedData.user_data.country = eventData.country;
  else if (user_data.country) mappedData.user_data.country = user_data.country;
  else if (address.country) mappedData.user_data.country = address.country;

  if (eventData.gender) mappedData.user_data.ge = eventData.gender;
  if (eventData.db) mappedData.user_data.db = eventData.db;

  return mappedData;
}

function addServerEventData(eventData, mappedData) {
  let serverEventDataList = {};

  if (eventData.event_id) mappedData.event_id = eventData.event_id;
  else if (eventData.transaction_id)
    mappedData.event_id = eventData.transaction_id;

  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((d) => {
      serverEventDataList[d.name] = d.value;
    });
  }

  if (serverEventDataList) {
    if (serverEventDataList.event_time)
      mappedData.event_time = serverEventDataList.event_time;
    if (serverEventDataList.event_source_url)
      mappedData.event_source_url = serverEventDataList.event_source_url;
    if (serverEventDataList.opt_out)
      mappedData.opt_out = serverEventDataList.opt_out;
    if (serverEventDataList.event_id)
      mappedData.event_id = serverEventDataList.event_id;
    if (serverEventDataList.referrer_url)
      mappedData.referrer_url = serverEventDataList.referrer_url;

    if (serverEventDataList.data_processing_options) {
      mappedData.data_processing_options =
        serverEventDataList.data_processing_options;

      if (serverEventDataList.data_processing_options_country)
        mappedData.data_processing_options_country =
          serverEventDataList.data_processing_options_country;
      if (serverEventDataList.data_processing_options_state)
        mappedData.data_processing_options_state =
          serverEventDataList.data_processing_options_state;
    }
  }

  return mappedData;
}

function addAppData(eventData, mappedData) {
  if (mappedData.action_source !== 'app') {
    return mappedData;
  }

  if (getType(eventData.app_data) === 'object') {
    mappedData.app_data = eventData.app_data;

    return mappedData;
  }

  if (eventData.advertiser_tracking_enabled)
    mappedData.app_data.advertiser_tracking_enabled =
      eventData.advertiser_tracking_enabled;
  if (eventData.application_tracking_enabled)
    mappedData.app_data.application_tracking_enabled =
      eventData.application_tracking_enabled;
  if (eventData.extinfo) mappedData.app_data.extinfo = eventData.extinfo;
  if (eventData.campaign_ids)
    mappedData.app_data.campaign_ids = eventData.campaign_ids;
  if (eventData.install_referrer)
    mappedData.app_data.install_referrer = eventData.install_referrer;
  if (eventData.installer_package)
    mappedData.app_data.installer_package = eventData.installer_package;
  if (eventData.url_schemes)
    mappedData.app_data.url_schemes = eventData.url_schemes;
  if (eventData.windows_attribution_id)
    mappedData.app_data.windows_attribution_id =
      eventData.windows_attribution_id;
  if (eventData.page_referrer)
    mappedData.referrer_url = eventData.page_referrer;

  return mappedData;
}

function setGtmEecCookie(userData) {
  let gtmeecCookie = {};

  if (userData.em) gtmeecCookie.em = userData.em;
  if (userData.ph) gtmeecCookie.ph = userData.ph;
  if (userData.ln) gtmeecCookie.ln = userData.ln;
  if (userData.fn) gtmeecCookie.fn = userData.fn;
  if (userData.ct) gtmeecCookie.ct = userData.ct;
  if (userData.st) gtmeecCookie.st = userData.st;
  if (userData.zp) gtmeecCookie.zp = userData.zp;
  if (userData.ge) gtmeecCookie.ge = userData.ge;
  if (userData.db) gtmeecCookie.db = userData.db;
  if (userData.country) gtmeecCookie.country = userData.country;
  if (userData.external_id) gtmeecCookie.external_id = userData.external_id;
  if (userData.fb_login_id) gtmeecCookie.fb_login_id = userData.fb_login_id;

  setCookie('_gtmeec', toBase64(JSON.stringify(gtmeecCookie)), {
    domain: 'auto',
    path: '/',
    samesite: 'strict',
    secure: true,
    'max-age': 7776000, // 90 days
    HttpOnly: true
  });
}

function enhanceEventData(userData) {
  const cookieValues = getCookieValues('_gtmeec');
  if ((!cookieValues || cookieValues.length === 0) && !commonCookie._gtmeec) {
    return userData;
  }

  const encodedValue = cookieValues[0] || commonCookie._gtmeec;
  if (!encodedValue) {
    return userData;
  }

  const jsonStr = fromBase64(encodedValue);
  if (!jsonStr) {
    return userData;
  }

  const gtmeecData = JSON.parse(jsonStr);

  if (gtmeecData) {
    if (!userData.em && gtmeecData.em) userData.em = gtmeecData.em;
    if (!userData.ph && gtmeecData.ph) userData.ph = gtmeecData.ph;
    if (!userData.ln && gtmeecData.ph) userData.ln = gtmeecData.ln;
    if (!userData.fn && gtmeecData.fn) userData.fn = gtmeecData.fn;
    if (!userData.ct && gtmeecData.ct) userData.ct = gtmeecData.ct;
    if (!userData.st && gtmeecData.st) userData.st = gtmeecData.st;
    if (!userData.zp && gtmeecData.zp) userData.zp = gtmeecData.zp;
    if (!userData.ge && gtmeecData.ge) userData.ge = gtmeecData.ge;
    if (!userData.db && gtmeecData.db) userData.db = gtmeecData.db;
    if (!userData.country && gtmeecData.country)
      userData.country = gtmeecData.country;
    if (!userData.external_id && gtmeecData.external_id)
      userData.external_id = gtmeecData.external_id;
    if (!userData.fb_login_id && gtmeecData.fb_login_id)
      userData.fb_login_id = gtmeecData.fb_login_id;
  }

  return userData;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  const itemRegex = createRegex('^[0-9]$');
  return phoneNumber
    .split('')
    .filter((item) => testRegex(itemRegex, item))
    .join('');
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
