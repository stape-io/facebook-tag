const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const createRegex = require('createRegex');
const decodeUriComponent = require('decodeUriComponent');
const encodeUriComponent = require('encodeUriComponent');
const fromBase64 = require('fromBase64');
const generateRandom = require('generateRandom');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Math = require('Math');
const parseUrl = require('parseUrl');
const Promise = require('Promise');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');
const testRegex = require('testRegex');
const toBase64 = require('toBase64');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();
const API_VERSION = '26.0';
const PARTNER_AGENT_STRING = 'stape-gtmss-2.1.7' + (data.enableEventEnhancement ? '-ee' : '');

if (shouldExitEarly(data, eventData)) {
  return data.gtmOnSuccess();
}

const ids = getClickAndBrowserId(data, eventData);
const fbc = ids.fbc;
const fbp = ids.fbp;
setIDsCookies(data, fbc, fbp);

const mappedPostBody = mapEvent(data, eventData, fbc, fbp);
sendRequests(data, mappedPostBody);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function setIDsCookies(data, fbc, fbp) {
  const cookieOptions = {
    domain: isUIFieldTrue(data.overrideCookieDomain)
      ? data.overridenCookieDomain || 'auto'
      : 'auto',
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
}

function getClickAndBrowserId(data, eventData) {
  const ids = {
    fbc:
      getCookieValues('_fbc')[0] ||
      (eventData.common_cookie || {})._fbc ||
      eventData._fbc ||
      eventData.fbc,
    fbp:
      getCookieValues('_fbp')[0] ||
      (eventData.common_cookie || {})._fbp ||
      eventData._fbp ||
      eventData.fbp
  };

  const url = getUrl(eventData);
  const subDomainIndex = url ? computeEffectiveTldPlusOne(url).split('.').length - 1 : 1;

  if (url) {
    const urlParsed = parseUrl(url);
    if (urlParsed && urlParsed.searchParams.fbclid) {
      const fbclid = decodeUriComponent(urlParsed.searchParams.fbclid);
      const fbcParts = ids.fbc ? ids.fbc.split('.') : [];

      if (isValidValue(fbclid) && (!ids.fbc || fbcParts[fbcParts.length - 1] !== fbclid)) {
        ids.fbc = 'fb.' + subDomainIndex + '.' + getTimestampMillis() + '.' + fbclid;
      }
    }
  }

  if (!ids.fbp && data.generateFbp) {
    ids.fbp =
      'fb.' +
      subDomainIndex +
      '.' +
      getTimestampMillis() +
      '.' +
      generateRandom(1000000000, 2147483647);
  }

  return ids;
}

function getEventName(data) {
  const gaToFacebookEventName = {
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

  if (data.inheritEventName !== 'override') {
    if (data.mapViewItemListToViewContent) {
      gaToFacebookEventName.view_item_list = 'ViewContent';
    }
    const eventName = eventData.event_name;
    return gaToFacebookEventName[eventName] || eventName;
  }

  let selectedEventName;
  if (data.eventName === 'standard') {
    selectedEventName = data.eventNameStandard;
  } else if (data.eventName === 'custom') {
    selectedEventName = data.eventNameCustom;
  }

  if (isValidValue(selectedEventName)) return selectedEventName;

  // An incomplete override falls back to the incoming name, as the inherit branch does.
  return gaToFacebookEventName[eventData.event_name] || eventData.event_name;
}

function mapEvent(data, eventData, fbc, fbp) {
  let mappedData = {
    event_name: getEventName(data),
    action_source: data.actionSource || 'website',
    event_time: Math.round(getTimestampMillis() / 1000),
    custom_data: {},
    user_data: {}
  };
  const mappedPostBody = {
    data: [mappedData],
    partner_agent: PARTNER_AGENT_STRING
  };

  if (eventData.test_event_code || data.testId) {
    mappedPostBody.test_event_code = eventData.test_event_code
      ? eventData.test_event_code
      : data.testId;
  }

  if (mappedData.action_source === 'app') {
    mappedData.app_data = {};
  }

  if (mappedData.action_source === 'business_messaging') {
    mappedData.messaging_channel = data.messaging_channel;
  }

  mappedData = addServerEventData(data, eventData, mappedData);
  mappedData = addUserData(data, eventData, mappedData, fbc, fbp);
  mappedData = addAppData(data, eventData, mappedData);
  mappedData = addEcommerceData(data, eventData, mappedData);
  mappedData = addOriginalEventData(mappedData);

  if (data.enableEventEnhancement) {
    mappedData.user_data = enhanceEventData(eventData, mappedData.user_data);
  }

  mappedData = overrideDataIfNeeded(mappedData);
  mappedData = cleanupData(mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  if (data.enableEventEnhancement) {
    setGtmEecCookie(mappedData.user_data);
  }

  return mappedPostBody;
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
  if (getType(data.userDataObject) === 'object') {
    mergeObj(mappedData.user_data, data.userDataObject);
  }
  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      mappedData.user_data[d.name] = d.value;
    });
  }

  if (getType(data.customDataObject) === 'object') {
    mergeObj(mappedData.custom_data, data.customDataObject);
  }
  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      mappedData.custom_data[d.name] = d.value;
    });
  }

  if (mappedData.action_source === 'app') {
    if (getType(data.appDataObject) === 'object') {
      mergeObj(mappedData.app_data, data.appDataObject);
    }
    if (data.appDataList) {
      data.appDataList.forEach((d) => {
        mappedData.app_data[d.name] = d.value;
      });
    }
  }

  return mappedData;
}

function cleanupData(mappedData) {
  if (mappedData.action_source === 'business_messaging') {
    mappedData.event_source_url = undefined;
    ['client_ip_address', 'client_user_agent', 'fbc', 'fbp'].forEach(
      (key) => (mappedData.user_data[key] = undefined)
    );
  }

  if (mappedData.user_data) {
    const userData = {};

    for (let userDataKey in mappedData.user_data) {
      if (isValidValue(mappedData.user_data[userDataKey])) {
        userData[userDataKey] = mappedData.user_data[userDataKey];
      }
    }

    mappedData.user_data = userData;
  }

  if (mappedData.custom_data) {
    const customData = {};

    for (let customDataKey in mappedData.custom_data) {
      if (isValidValue(mappedData.custom_data[customDataKey])) {
        customData[customDataKey] = mappedData.custom_data[customDataKey];
      }
    }

    if (customData.value === 0 || customData.value === '0') customData.value = '0.00';

    mappedData.custom_data = customData;
  }

  if (mappedData.app_data) {
    const appData = {};

    for (let appDataKey in mappedData.app_data) {
      if (isValidValue(mappedData.app_data[appDataKey])) {
        appData[appDataKey] = mappedData.app_data[appDataKey];
      }
    }

    mappedData.app_data = appData;
  }

  if (mappedData.original_event_data) {
    const originalEventData = {};

    for (let originalEventDataKey in mappedData.original_event_data) {
      if (isValidValue(mappedData.original_event_data[originalEventDataKey])) {
        originalEventData[originalEventDataKey] =
          mappedData.original_event_data[originalEventDataKey];
      }
    }

    mappedData.original_event_data = originalEventData;
  }

  for (let key in mappedData) { // Assigned, not rebuilt: the post body holds this reference.
    if (!isValidValue(mappedData[key])) mappedData[key] = undefined;
  }

  return mappedData;
}

function addEcommerceData(data, eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapCustomData') ? data.autoMapCustomData : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    let currencyFromItems = '';
    let valueFromItems = 0;

    let items;
    if (getType(eventData.items) === 'array' && eventData.items.length) items = eventData.items;
    else if (
      getType(eventData.ecommerce) === 'object' &&
      getType(eventData.ecommerce.items) === 'array' &&
      eventData.ecommerce.items.length
    ) {
      items = eventData.ecommerce.items;
    }

    if (items) {
      mappedData.custom_data.content_type =
        eventData['x-fb-cd-content_type'] || eventData.content_type || 'product';

      if (
        data.mapViewItemListToViewContent &&
        data.inheritEventName !== 'override' &&
        eventData.event_name === 'view_item_list'
      ) {
        mappedData.custom_data.content_type = 'product_group';
      }

      if (!items[1]) {
        if (items[0].item_name) mappedData.custom_data.content_name = items[0].item_name;
        if (items[0].item_category)
          mappedData.custom_data.content_category = items[0].item_category;

        const singleItemPrice = toFiniteNumber(items[0].price);
        const singleItemQuantity = toFiniteNumber(items[0].quantity);
        if (isValidValue(singleItemPrice)) {
          mappedData.custom_data.value = isValidValue(singleItemQuantity)
            ? singleItemQuantity * singleItemPrice
            : singleItemPrice;
        }
      }

      const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
      const mapItemDataTo = data.mapItemDataTo || 'contents';
      items.forEach((d) => {
        if (!currencyFromItems && d.currency) currencyFromItems = d.currency;

        const content = {};
        let hasContent = false;

        if (isValidValue(d[itemIdKey])) {
          content.id = makeString(d[itemIdKey]);
          hasContent = true;
        }
        if (d.item_name) {
          content.title = d.item_name;
          hasContent = true;
        }
        if (d.item_brand) {
          content.brand = d.item_brand;
          hasContent = true;
        }
        if (d.item_category) {
          content.category = d.item_category;
          hasContent = true;
        }

        const quantity = toFiniteNumber(d.quantity);
        if (isValidValue(quantity)) {
          content.quantity = quantity;
          hasContent = true;
        }

        const itemPrice = toFiniteNumber(d.price);
        if (isValidValue(itemPrice)) {
          content.item_price = itemPrice;
          hasContent = true;
          valueFromItems += isValidValue(quantity) ? quantity * itemPrice : itemPrice;
        }

        if (!hasContent) return;

        if (mapItemDataTo === 'contents' || mapItemDataTo === 'both') {
          mappedData.custom_data.contents = mappedData.custom_data.contents || [];
          mappedData.custom_data.contents.push(content);
        }
        if (content.id && (mapItemDataTo === 'content_ids' || mapItemDataTo === 'both')) {
          mappedData.custom_data.content_ids = mappedData.custom_data.content_ids || [];
          mappedData.custom_data.content_ids.push(content.id);
        }
      });

      if (!mappedData.custom_data.contents && !mappedData.custom_data.content_ids) {
        mappedData.custom_data.content_type = undefined;
      }
    }

    const value = toFiniteNumber(
      eventData['x-ga-mp1-ev'] || eventData['x-ga-mp1-tr'] || eventData.value
    );
    if (isValidValue(value)) mappedData.custom_data.value = value;

    const currency = eventData.currency || currencyFromItems;
    if (currency) mappedData.custom_data.currency = currency;

    if (eventData.search_term) mappedData.custom_data.search_string = eventData.search_term;

    if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;

    if (mappedData.event_name === 'Purchase') {
      // Facebook rejects a Purchase event with no value at all, so this always assigns one.
      if (!isValidValue(mappedData.custom_data.value))
        mappedData.custom_data.value = valueFromItems;
    }

    if (
      !mappedData.custom_data.currency &&
      (isValidValue(mappedData.custom_data.value) || valueFromItems)
    ) {
      mappedData.custom_data.currency = 'USD';
    }
  }

  return mappedData;
}

function addUserData(data, eventData, mappedData, fbc, fbp) {
  const autoMapEnabled = data.hasOwnProperty('autoMapUserData') ? data.autoMapUserData : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    let address = {};
    let user_data = {};
    if (getType(eventData.user_data) === 'object') {
      user_data = eventData.user_data;
      const addressType = getType(user_data.address);
      if (addressType === 'object' || addressType === 'array') {
        address = user_data.address[0] || user_data.address;
      }
    }

    if (fbc) mappedData.user_data.fbc = fbc;
    if (fbp) mappedData.user_data.fbp = fbp;

    if (eventData.user_agent) mappedData.user_data.client_user_agent = eventData.user_agent;

    if (eventData.ip_override) {
      mappedData.user_data.client_ip_address = eventData.ip_override
        .split(' ')
        .join('')
        .split(',')[0];
    }

    if (eventData.fb_login_id) mappedData.user_data.fb_login_id = eventData.fb_login_id;

    if (eventData.anon_id) mappedData.user_data.anon_id = eventData.anon_id;

    if (eventData.madid) mappedData.user_data.madid = eventData.madid;

    const externalId = eventData.external_id || eventData.user_id || eventData.userId;
    if (externalId) mappedData.user_data.external_id = externalId;

    const subscriptionId = eventData.subscription_id || eventData.subscriptionId;
    if (subscriptionId) mappedData.user_data.subscription_id = subscriptionId;

    const leadId = eventData.lead_id || eventData.leadId;
    if (leadId) mappedData.user_data.lead_id = leadId;

    const ln =
      eventData.lastName ||
      eventData.LastName ||
      eventData.nameLast ||
      eventData.last_name ||
      user_data.last_name ||
      address.last_name ||
      address.sha256_last_name;
    if (ln) mappedData.user_data.ln = ln;

    const fn =
      eventData.firstName ||
      eventData.FirstName ||
      eventData.nameFirst ||
      eventData.first_name ||
      user_data.first_name ||
      address.first_name ||
      address.sha256_first_name;
    if (fn) mappedData.user_data.fn = fn;

    const em =
      eventData.email ||
      user_data.email_address ||
      user_data.email ||
      user_data.sha256_email_address;
    if (em) mappedData.user_data.em = em;

    const ph = eventData.phone || user_data.phone_number || user_data.phone;
    if (ph) mappedData.user_data.ph = ph;

    const ct = eventData.city || address.city;
    if (ct) mappedData.user_data.ct = ct;

    const st = eventData.state || eventData.region || user_data.region || address.region;
    if (st) mappedData.user_data.st = st;

    const zp =
      eventData.zip || eventData.postal_code || user_data.postal_code || address.postal_code;
    if (zp) mappedData.user_data.zp = zp;

    const country =
      eventData.countryCode || eventData.country || user_data.country || address.country;
    if (country) mappedData.user_data.country = country;

    if (eventData.gender) mappedData.user_data.ge = eventData.gender;
    if (eventData.db) mappedData.user_data.db = eventData.db;
  }
  return mappedData;
}

function addServerEventData(data, eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapServerEventData')
    ? data.autoMapServerEventData
    : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    if (eventData.page_location) mappedData.event_source_url = eventData.page_location;
    if (eventData.page_referrer) mappedData.referrer_url = eventData.page_referrer;

    const eventId = eventData.event_id || eventData.transaction_id;
    if (eventId) mappedData.event_id = eventId;
  }

  if (data.serverEventDataList) {
    const required = ['event_time'];

    data.serverEventDataList.forEach((d) => {
      // A required field can be replaced but not cleared, so an empty one is ignored.
      if (required.indexOf(d.name) !== -1 && !isValidValue(d.value)) return;
      mappedData[d.name] = d.value;
    });

    if (
      !mappedData.data_processing_options &&
      (mappedData.data_processing_options_country || mappedData.data_processing_options_state)
    ) {
      mappedData.data_processing_options_country = undefined;
      mappedData.data_processing_options_state = undefined;
    }
  }

  return mappedData;
}

function addAppData(data, eventData, mappedData) {
  if (mappedData.action_source !== 'app') {
    return mappedData;
  }

  const autoMapEnabled = data.hasOwnProperty('autoMapAppData') ? data.autoMapAppData : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    if (getType(eventData.app_data) === 'object') {
      mappedData.app_data = eventData.app_data;
      return mappedData;
    }

    mappedData.app_data.advertiser_tracking_enabled = eventData.advertiser_tracking_enabled ? 1 : 0; // Required
    mappedData.app_data.application_tracking_enabled = eventData.application_tracking_enabled
      ? 1
      : 0; // Required
    if (eventData.extinfo) {
      mappedData.app_data.extinfo = eventData.extinfo;
    } else {
      const platform = makeString(eventData['x-ga-platform'] || '').toLowerCase();
      const extinfoArray = [
        platform === 'android' ? 'a2' : platform === 'ios' ? 'i2' : '', // Required
        eventData.app_id || '',
        eventData.app_version || '',
        eventData.app_version ? 'Version ' + eventData.app_version : '',
        makeString(eventData['x-ga-os_version'] || ''), // Required
        eventData['x-ga-device_model'] || '',
        eventData.language || '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ];
      mappedData.app_data.extinfo = extinfoArray;
    }
    if (eventData.campaign_ids) mappedData.app_data.campaign_ids = eventData.campaign_ids;
    if (eventData.install_referrer)
      mappedData.app_data.install_referrer = eventData.install_referrer;
    if (eventData.installer_package)
      mappedData.app_data.installer_package = eventData.installer_package;
    if (eventData.url_schemes) mappedData.app_data.url_schemes = eventData.url_schemes;
    if (eventData.vendor_id) mappedData.app_data.vendor_id = eventData.vendor_id;
    if (eventData.windows_attribution_id)
      mappedData.app_data.windows_attribution_id = eventData.windows_attribution_id;
  }

  return mappedData;
}

function addOriginalEventData(mappedData) {
  if (mappedData.event_name !== 'AppendValue') {
    return mappedData;
  }

  if (data.originalEventDataList) {
    mappedData.action_source = undefined;

    mappedData.original_event_data = {};
    data.originalEventDataList.forEach((d) => {
      mappedData.original_event_data[d.name] = d.value;
    });
  }

  return mappedData;
}

function setGtmEecCookie(userData) {
  const gtmeecCookie = {};

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
    domain: isUIFieldTrue(data.overrideCookieDomain)
      ? data.overridenCookieDomain || 'auto'
      : 'auto',
    path: '/',
    samesite: 'strict',
    secure: true,
    'max-age': 7776000, // 90 days
    HttpOnly: true
  });
}

function enhanceEventData(eventData, userData) {
  const commonCookie = eventData.common_cookie || {};

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

  if (getType(gtmeecData) !== 'object') {
    return userData;
  }

  const keys = 'em,ph,ln,fn,ct,st,zp,ge,db,country,external_id,fb_login_id'.split(',');
  keys.forEach((key) => {
    const value = gtmeecData[key];
    const valueType = getType(value);
    if (userData[key] || (valueType !== 'string' && valueType !== 'number')) return;
    if (isValidValue(value)) userData[key] = value;
  });

  return userData;
}

function sendRequests(data, mappedPostBody) {
  let pixelsConfig = [
    {
      pixelId: data.pixelId,
      accessToken: data.accessToken,
      appSecretProof: data.useAppSecretProof ? data.appSecretProof : undefined
    }
  ];
  if (data.enableMultipixelSetup) {
    pixelsConfig = pixelsConfig.concat(data.pixelIdAndAccessTokenTable);
  }

  const requests = pixelsConfig.map((pixelConfig) => {
    const pixelId = pixelConfig.pixelId;
    const accessToken = pixelConfig.accessToken;
    const appSecretProof = pixelConfig.appSecretProof;
    const postUrl =
      'https://graph.facebook.com/v' +
      API_VERSION +
      '/' +
      enc(pixelId) +
      '/events?access_token=' +
      enc(accessToken) +
      (appSecretProof ? '&appsecret_proof=' + enc(appSecretProof) : '');

    return sendHttpRequest(
      postUrl,
      { headers: { 'content-type': 'application/json' }, method: 'POST' },
      JSON.stringify(mappedPostBody)
    )
      .then((result) => {
        if (result.statusCode < 200 || result.statusCode >= 300) return false;
        return true;
      })
      .catch((result) => {
        return false;
      });
  });

  Promise.all(requests)
    .then((results) => {
      if (!data.useOptimisticScenario) {
        const someRequestFailed = results.some((success) => !success);
        if (someRequestFailed) return data.gtmOnFailure();
        return data.gtmOnSuccess();
      }
    })
    .catch((result) => {
      if (!data.useOptimisticScenario) return data.gtmOnFailure();
    });
}

/*==============================================================================
  Helpers
==============================================================================*/

function getUrl(eventData) {
  return eventData.page_location || getRequestHeader('referer') || eventData.page_referrer;
}

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) return true;

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) return true;

  return false;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function isValidValue(value) {
  const valueType = getType(value);
  if (valueType === 'null' || valueType === 'undefined' || value !== value) return false;
  return value !== '' && value !== 'undefined' && value !== 'null';
}

function toFiniteNumber(value) {
  if (!isValidValue(value)) return undefined;

  const valueType = getType(value);
  if (valueType !== 'number' && valueType !== 'string') return undefined;
  if (valueType === 'string' && value.trim() === '') return undefined; // Whitespace coerces to 0.

  const parsed = makeNumber(value);
  if (parsed * 0 !== 0) return undefined; // Rejects NaN and +/-Infinity.

  return parsed;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  const itemRegex = createRegex('^[0-9]$');
  return phoneNumber
    .split('')
    .filter((item) => testRegex(itemRegex, item))
    .join('');
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function mergeObj(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) target[key] = source[key];
  }
  return target;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
