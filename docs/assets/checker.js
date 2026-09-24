// Pitch Checker rules engine. Runs entirely in the browser: the pasted email is
// never sent anywhere. The same rules ship inside the extension's content
// script, so this file is the single source of truth for detection logic.
//
// analyze(text) -> {
//   score, level: 'low' | 'medium' | 'high' | 'critical',
//   verified: true when the sender is confirmed (official brand domain or
//             header authentication) and nothing serious was found,
//   insufficient: true when there was no sender and nothing to go on, so a
//             "low" level means "not enough to judge" rather than "fine",
//   findings: [{ id, severity: 'info' | 'low' | 'medium' | 'high' | 'critical', title, detail }],
//   sender: { from, fromDomain, replyTo, replyToDomain },
//   brands: [{ name, official: [domain], matchedDomain, lookalike }],
//   terms: { rate, deliverables, deadlines, exclusivity, usageRights, paymentTerms, missing }
// }
(function (global) {
  'use strict';

  var FREE_MAIL = [
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com', 'aol.com', 'icloud.com', 'me.com', 'protonmail.com',
    'proton.me', 'pm.me', 'zoho.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com',
    'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com', 'tutanota.com', 'tuta.io'
  ];

  var SHORTENERS = [
    'bit.ly', 'tinyurl.com', 'cutt.ly', 't.co', 'rebrand.ly', 'is.gd', 'buff.ly',
    'shorturl.at', 'rb.gy', 'tiny.cc', 'lnkd.in', 't.ly', 'ow.ly', 'bl.ink', 'shor.by'
  ];

  var FILE_HOSTS = [
    'mediafire.com', 'mega.nz', 'mega.io', 'anonfiles.com', 'gofile.io', 'sendspace.com',
    'file.io', 'transfer.sh', 'filetransfer.io', 'wetransfer.com', 'we.tl', 'dropbox.com/scl',
    'dropboxusercontent.com', 'drive.google.com/uc', 'pixeldrain.com', 'files.fm',
    'ufile.io', 'krakenfiles.com', 'bowfile.com', 'send.cm', 'catbox.moe', 'discord.com/attachments',
    'cdn.discordapp.com', '1fichier.com', 'uploadnow.io', 'filemail.com', 'easyupload.io',
    '1drv.ms', 'sites.google.com'
  ];

  // 'com' and 'app' are omitted on purpose: they collide with domain names in prose.
  var DANGEROUS_EXT = ['exe', 'scr', 'bat', 'cmd', 'pif', 'msi', 'msix', 'appx', 'js', 'jse', 'vbs',
    'vbe', 'wsf', 'wsh', 'ps1', 'hta', 'lnk', 'url', 'iso', 'img', 'vhd', 'vhdx', 'dmg', 'pkg', 'apk',
    'jar', 'reg', 'dll', 'xll', 'one', 'docm', 'xlsm', 'pptm', 'html', 'htm', 'svg'];
  // Extensions that are also everyday words or tech names in prose ("Next.js",
  // "index.html", "ISO 400"). They only count when the name looks like a file
  // (underscore, dash, digit or a second extension) or the sentence talks about
  // attaching, downloading or opening it.
  var AMBIGUOUS_EXT = ['js', 'img', 'reg', 'pkg', 'jar', 'iso', 'one', 'url', 'html', 'htm', 'svg'];
  var FILE_CONTEXT = /\b(attach(ed|ment|ments)?|download(ed|ing)?|open(ing)?|run(ning)?|install(ing)?|extract|unzip|launch)\b/i;
  var ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'arj', 'cab', 'ace'];

  // Brands that show up most often in impersonated sponsorship pitches, with
  // domains they actually send from. Best-effort list; the extension ships a
  // versioned data file. A domain that *contains* the brand token but is not in
  // `official` is treated as a lookalike.
  var BRANDS = [
    { name: 'NordVPN', tokens: ['nordvpn', 'nord vpn'], official: ['nordvpn.com', 'nordaccount.com', 'nordsec.com', 'nordsecurity.com', 'nordpass.com', 'nordvpn.net'] },
    { name: 'ExpressVPN', tokens: ['expressvpn', 'express vpn'], official: ['expressvpn.com', 'expressvpn.net'] },
    { name: 'Surfshark', tokens: ['surfshark'], official: ['surfshark.com'] },
    { name: 'Raid: Shadow Legends', tokens: ['raid shadow legends', 'raid: shadow legends', 'plarium'], official: ['plarium.com'] },
    { name: 'Honey', tokens: ['joinhoney', 'honey extension', 'paypal honey'], official: ['joinhoney.com', 'paypal.com'] },
    { name: 'Skillshare', tokens: ['skillshare'], official: ['skillshare.com'] },
    { name: 'Squarespace', tokens: ['squarespace'], official: ['squarespace.com', 'squarespace-mail.com'] },
    { name: 'Audible', tokens: ['audible'], official: ['audible.com', 'amazon.com'] },
    { name: 'HelloFresh', tokens: ['hellofresh', 'hello fresh'], official: ['hellofresh.com', 'hellofresh.co.uk', 'hellofresh.de'] },
    { name: 'Ridge', tokens: ['ridge wallet', 'ridgewallet'], official: ['ridge.com', 'ridgewallet.com'] },
    { name: 'Manscaped', tokens: ['manscaped'], official: ['manscaped.com'] },
    { name: 'Displate', tokens: ['displate'], official: ['displate.com'] },
    { name: 'Opera GX', tokens: ['opera gx', 'operagx'], official: ['opera.com', 'opera.software'] },
    { name: 'Grammarly', tokens: ['grammarly'], official: ['grammarly.com'] },
    { name: 'Brilliant', tokens: ['brilliant.org', 'brilliant'], official: ['brilliant.org'] },
    { name: 'BetterHelp', tokens: ['betterhelp', 'better help'], official: ['betterhelp.com'] },
    { name: 'Shopify', tokens: ['shopify'], official: ['shopify.com', 'shopifyemail.com'] },
    { name: 'CASETiFY', tokens: ['casetify'], official: ['casetify.com'] },
    { name: 'G FUEL', tokens: ['gfuel', 'g fuel'], official: ['gfuel.com'] },
    { name: 'Keeps', tokens: ['keeps.com', 'keeps hair'], official: ['keeps.com'] },
    { name: 'Dashlane', tokens: ['dashlane'], official: ['dashlane.com'] },
    { name: 'Curiosity Stream', tokens: ['curiositystream', 'curiosity stream'], official: ['curiositystream.com'] },
    { name: 'Nebula', tokens: ['nebula'], official: ['nebula.tv', 'nebula.app', 'watchnebula.com'] },
    { name: 'MagellanTV', tokens: ['magellantv', 'magellan tv'], official: ['magellantv.com'] },
    { name: 'World of Tanks', tokens: ['world of tanks', 'wargaming'], official: ['wargaming.net', 'worldoftanks.com'] },
    { name: 'War Thunder', tokens: ['war thunder', 'gaijin'], official: ['gaijin.net', 'warthunder.com'] },
    { name: 'Hims & Hers', tokens: ['forhims', 'hims'], official: ['forhims.com', 'forhers.com', 'hims.com'] },
    { name: 'AG1', tokens: ['athletic greens', 'drinkag1', 'ag1'], official: ['drinkag1.com', 'athleticgreens.com'] },
    { name: 'Factor', tokens: ['factor75', 'factor meals'], official: ['factor75.com', 'factormeals.com'] },
    { name: 'Rocket Money', tokens: ['rocket money', 'rocketmoney'], official: ['rocketmoney.com'] },
    { name: 'Blinkist', tokens: ['blinkist'], official: ['blinkist.com'] },
    { name: 'Wix', tokens: ['wix'], official: ['wix.com'] },
    { name: 'Hostinger', tokens: ['hostinger'], official: ['hostinger.com'] },
    { name: 'Epidemic Sound', tokens: ['epidemic sound', 'epidemicsound'], official: ['epidemicsound.com'] },
    { name: 'Artlist', tokens: ['artlist'], official: ['artlist.io'] },
    { name: 'Adobe', tokens: ['adobe'], official: ['adobe.com', 'adobe.io'] },
    { name: 'Canva', tokens: ['canva'], official: ['canva.com'] },
    { name: 'Notion', tokens: ['notion'], official: ['notion.so', 'makenotion.com', 'notion.com'] },
    { name: 'Warby Parker', tokens: ['warby parker', 'warbyparker'], official: ['warbyparker.com'] },
    { name: 'Mint Mobile', tokens: ['mint mobile', 'mintmobile'], official: ['mintmobile.com'] },
    { name: 'KiwiCo', tokens: ['kiwico'], official: ['kiwico.com'] },
    { name: 'Aura', tokens: ['aura.com', 'aura antivirus'], official: ['aura.com'] },
    { name: 'Incogni', tokens: ['incogni'], official: ['incogni.com', 'surfshark.com'] },
    { name: 'DeleteMe', tokens: ['deleteme', 'joindeleteme'], official: ['joindeleteme.com', 'abine.com'] },
    { name: 'Temu', tokens: ['temu'], official: ['temu.com', 'temuemail.com'] },
    { name: 'SHEIN', tokens: ['shein'], official: ['shein.com', 'sheinemail.com', 'sheinnotice.com'] },
    { name: 'Genshin Impact', tokens: ['genshin', 'hoyoverse', 'mihoyo'], official: ['hoyoverse.com', 'mihoyo.com'] },
    { name: 'Established Titles', tokens: ['established titles', 'establishedtitles'], official: ['establishedtitles.com'] },
    { name: 'Dollar Shave Club', tokens: ['dollar shave club', 'dollarshaveclub'], official: ['dollarshaveclub.com'] },
    { name: 'Lenovo', tokens: ['lenovo'], official: ['lenovo.com'] },
    { name: 'Razer', tokens: ['razer'], official: ['razer.com'] },
    { name: 'Logitech', tokens: ['logitech'], official: ['logitech.com', 'logi.com'] },
    { name: 'SteelSeries', tokens: ['steelseries'], official: ['steelseries.com'] },
    { name: 'Corsair', tokens: ['corsair'], official: ['corsair.com'] },
    { name: 'Elgato', tokens: ['elgato'], official: ['elgato.com', 'corsair.com'] },
    { name: 'Samsung', tokens: ['samsung'], official: ['samsung.com'] },
    { name: 'Sony', tokens: ['sony'], official: ['sony.com', 'sony.net', 'sonymusic.com'] },
    { name: 'Nike', tokens: ['nike'], official: ['nike.com'] },
    { name: 'Adidas', tokens: ['adidas'], official: ['adidas.com'] },
    { name: 'Gymshark', tokens: ['gymshark'], official: ['gymshark.com'] },
    { name: 'Fashion Nova', tokens: ['fashion nova', 'fashionnova'], official: ['fashionnova.com'] },
    { name: 'Sephora', tokens: ['sephora'], official: ['sephora.com'] },
    { name: 'Ulta', tokens: ['ulta'], official: ['ulta.com'] },
    { name: 'Dyson', tokens: ['dyson'], official: ['dyson.com'] },
    { name: 'GoPro', tokens: ['gopro'], official: ['gopro.com'] },
    { name: 'DJI', tokens: ['dji'], official: ['dji.com'] },
    { name: 'Insta360', tokens: ['insta360'], official: ['insta360.com'] },
    { name: 'Red Bull', tokens: ['red bull', 'redbull'], official: ['redbull.com'] },
    { name: 'Monster Energy', tokens: ['monster energy'], official: ['monsterenergy.com'] },
    { name: 'Prime Hydration', tokens: ['prime hydration', 'drinkprime'], official: ['drinkprime.com'] },
    { name: 'Coinbase', tokens: ['coinbase'], official: ['coinbase.com'] },
    { name: 'Binance', tokens: ['binance'], official: ['binance.com'] },
    { name: 'Crypto.com', tokens: ['crypto.com'], official: ['crypto.com'] },
    { name: 'Amazon', platformOnly: true, tokens: ['amazon'], official: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.ca', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.in', 'amazon.sg', 'amazon.ae', 'amazon.sa', 'amazon.eg', 'amazon.co.jp', 'amazon.com.au', 'amazon.com.mx', 'amazon.com.br', 'amazon.com.tr', 'amazonsellerservices.com'] },
    { name: 'Google', platformOnly: true, tokens: ['google', 'youtube'], official: ['google.com', 'youtube.com', 'youtu.be', 'gmail.com', 'googlemail.com', 'goo.gl', 'withgoogle.com'] },
    { name: 'Meta', platformOnly: true, tokens: ['instagram', 'facebook', 'meta'], official: ['meta.com', 'fb.com', 'facebookmail.com', 'instagram.com', 'facebook.com'] },
    { name: 'TikTok', platformOnly: true, tokens: ['tiktok'], official: ['tiktok.com', 'bytedance.com', 'tiktokglobalshop.com'] },
    { name: 'Spotify', platformOnly: true, tokens: ['spotify'], official: ['spotify.com', 'spotifymail.com'] },
    { name: 'Discord', platformOnly: true, tokens: ['discord'], official: ['discord.com', 'discordapp.com', 'discord.gg', 'discord.new', 'dis.gd'] },
    { name: 'Twitch', platformOnly: true, tokens: ['twitch'], official: ['twitch.tv', 'amazon.com'] },
    { name: 'Microsoft', tokens: ['microsoft', 'xbox'], official: ['microsoft.com', 'xbox.com'] },
    { name: 'Nintendo', tokens: ['nintendo'], official: ['nintendo.com', 'nintendo.net', 'nintendo.co.jp'] },
    { name: 'Epic Games', tokens: ['epic games', 'epicgames', 'fortnite'], official: ['epicgames.com'] },
    { name: 'EA', tokens: ['electronic arts'], official: ['ea.com'] },
    { name: 'Ubisoft', tokens: ['ubisoft'], official: ['ubisoft.com', 'ubi.com'] },
    { name: 'Riot Games', tokens: ['riot games', 'riotgames'], official: ['riotgames.com'] },
    { name: 'Roblox', tokens: ['roblox'], official: ['roblox.com'] },
    { name: 'Uber', tokens: ['uber eats', 'uber'], official: ['uber.com'] },
    { name: 'DoorDash', tokens: ['doordash'], official: ['doordash.com'] },
    { name: 'Airbnb', tokens: ['airbnb'], official: ['airbnb.com'] },
    { name: 'Booking.com', tokens: ['booking.com'], official: ['booking.com'] },
    { name: 'Expedia', tokens: ['expedia'], official: ['expedia.com'] },
    { name: 'L\u2019Or\u00e9al', tokens: ['loreal', 'l\u2019or\u00e9al', 'l\'or\u00e9al'], official: ['loreal.com'] },
    { name: 'Estee Lauder', tokens: ['estee lauder', 'est\u00e9e lauder'], official: ['esteelauder.com', 'elcompanies.com'] },
    { name: 'Coca-Cola', tokens: ['coca-cola', 'coca cola'], official: ['coca-cola.com', 'coca-colacompany.com'] },
    { name: 'Pepsi', tokens: ['pepsi'], official: ['pepsico.com', 'pepsi.com'] },
    { name: 'McDonald\u2019s', tokens: ['mcdonald'], official: ['mcdonalds.com', 'us.mcd.com'] },
    { name: 'Starbucks', tokens: ['starbucks'], official: ['starbucks.com'] },
    { name: 'LEGO', tokens: ['lego'], official: ['lego.com'] },
    { name: 'Disney', tokens: ['disney'], official: ['disney.com', 'disneyplus.com'] },
    { name: 'Netflix', tokens: ['netflix'], official: ['netflix.com'] },
    { name: 'Paramount', tokens: ['paramount'], official: ['paramount.com', 'paramountplus.com'] },
    { name: 'Warner Bros.', tokens: ['warner bros', 'warnerbros'], official: ['warnerbros.com', 'wbd.com'] }
  ];

  var GENERIC_GREETINGS = [
    /\bdear\s+(creator|influencer|youtuber|content creator|partner|channel owner|user|customer|friend|sir\/madam|sir or madam|talent)\b/i,
    /\b(hello|hi|hey)\s+(dear|there|creator|influencer|youtuber)\b/i,
    /\bto whom it may concern\b/i
  ];

  var URGENCY = [
    /\bwithin\s+(24|48|72)\s*(hours|hrs)\b/i, /\b(limited|few|only \d+)\s+(slots|spots|places)\b/i,
    /\b(asap|as soon as possible)\b/i, /\btoday only\b/i, /\b(expires?|closing)\s+(today|tonight|tomorrow|in \d+ hours)\b/i,
    /\burgent(ly)?\b/i, /\blast chance\b/i, /\bimmediate(ly)? response\b/i, /\breply (right )?now\b/i
  ];

  // Matched per sentence. A sentence where the brand is the one paying ("we
  // cover all shipping costs") is skipped: that is a normal gifting pitch.
  var PAY_TO_PLAY = [
    /\b(small|little|minor|refundable|processing|activation|registration|verification)\s+(shipping\s+|delivery\s+|customs\s+)?(fee|deposit|payment|charge)\b/i,
    /\bpay (for )?(the |a |an )?(small |one[- ]time )?(shipping|delivery|customs|product|sample|item)s?\b/i,
    /\b(shipping|delivery|customs|handling)\s+(fee|cost|charge)s?\b/i,
    /\b(refund(ed)?|reimburse(d)?)\s+(after|once|when|upon)\b/i,
    /\bbuy (the )?(product|item|sample)s?\s+(first|yourself|upfront)\b/i,
    /\b(purchase|order)\s+(first|upfront|in advance)\b/i,
    /\bwe will (send|pay) you (back|the money)\b/i,
    // "Ambassador" scams: the creator buys at a steep "exclusive" discount.
    /\b(you|yourself)\b[^.!?\n]{0,40}\b(buy|purchase|order|pay for)\b[^.!?\n]{0,60}\b(\d{2,3}\s*%\s*off|discount(ed)?|promo code|coupon)\b/i,
    /\b(\d{2,3}\s*%\s*off|discount code|promo code|coupon)\b[^.!?\n]{0,60}\b(you|yourself)\b[^.!?\n]{0,30}\b(buy|purchase|order|pay)\b/i
  ];
  var BRAND_PAYS = /\b(we|brand|they)('ll| will)?\s+(cover|handle|take care of|pay for|include)\s+(all\s+)?(the\s+|any\s+)?(shipping|delivery|customs|handling)|\b(free|complimentary|prepaid)\s+(shipping|delivery)\b|\b(shipping|delivery)\s+(is\s+|will be\s+)?(free|covered|on us|included|prepaid)\b/i;

  var OFF_PLATFORM = [
    /\b(gift ?cards?|steam cards?|itunes cards?)\b/i, /\b(bitcoin|btc|ethereum|usdt|crypto(currency)?)\b/i,
    /\b(western union|moneygram|cash ?app|zelle|venmo|paypal\.me)\b/i,
    /\bfriends\s*(and|&)\s*family\b/i,
    /\b(contact|reach|message|text|dm|chat|add|find|ping)\s+(me|us)\s+(up\s+)?(on|via|at)\s+(telegram|whatsapp|signal|skype|wechat)\b/i,
    /\b(telegram|whatsapp|signal)\s*[:@]\s*[@+]?\w/i,
    /\b(t\.me|wa\.me)\//i
  ];

  var LOGIN_LURE = [
    /\b(log ?in|sign ?in|authenticate|verify)\s+(with|via|using|through)?\s*(your\s+)?(google|gmail|youtube|instagram|tiktok|facebook|meta)?\s*(account)?\s*(to|and)\s+(view|see|open|access|download|review|accept)\b/i,
    /\b(verify|confirm)\s+(your\s+)?(channel|account|identity|ownership)\b/i,
    // "Review the brief here" or "our secure portal" alone is how real agencies
    // write; it only becomes a lure with a sign-in step.
    /\b(log ?in|sign ?in)\b[^.!?\n]{0,60}\b(secure|encrypted)\s+(portal|document|link)\b/i,
    /\b(secure|encrypted)\s+(portal|document|link)\b[^.!?\n]{0,60}\b(log ?in|sign ?in)\b/i
  ];

  var ARCHIVE_PASSWORD = [
    /\bpassword\s*(for|to|of)?\s*(the\s+)?(archive|file|zip|rar|folder|attachment|brief|document)\b/i,
    /\b(archive|file|zip|rar|folder|brief)\s+(is\s+)?(password[- ]protected|encrypted)\b/i,
    /\bpassword\s*(is|:)\s*\S+/i
  ];

  var USAGE_RIGHTS = [
    { re: /\bin perpetuity\b|\bperpetual(ly)?\b|\bforever\b/i, label: 'Perpetual usage rights', severity: 'high' },
    { re: /\b(all|any)\s+(media|channels|platforms|formats)\b/i, label: 'All-media usage rights', severity: 'medium' },
    { re: /\bworldwide\b|\buniversal\b/i, label: 'Worldwide territory', severity: 'low' },
    { re: /\b(whitelist(ing)?|paid (amplification|media|ads)|spark ads?|dark ?posts?|boost(ing)? (the )?post)\b/i, label: 'Whitelisting / paid amplification', severity: 'medium' },
    { re: /\b(irrevocable|royalty[- ]free|sublicens\w+|transferable|assignable)\b/i, label: 'Irrevocable / sublicensable license', severity: 'high' },
    { re: /\b(work for hire|work made for hire|assign(s|ment of)? (all )?(rights|intellectual property|ip)|own(s|ership of)? (the )?(content|footage|raw))\b/i, label: 'IP assignment / work-for-hire', severity: 'high' },
    { re: /\b(morality|morals) clause\b/i, label: 'Morality clause', severity: 'info' },
    { re: /\b\d+[- ]?(day|week|month|year)s?\s+(of\s+)?(organic\s+|paid\s+)?(usage|licens\w+)\s*(rights?)?\b|\b(usage|licens\w+)\s+(rights?\s+)?(for|of)\s+\d+[- ]?(day|week|month|year)s?\b/i, label: 'Time-limited usage rights', severity: 'info' },
    { re: /\borganic\s+(usage|use|rights?|only)\b/i, label: 'Organic usage only', severity: 'info' }
  ];

  var SENDER_REPUTATION_PHRASES = [
    /\b(we (are|represent|work with)|on behalf of|partner(ed|ing)? with)\s+[A-Z][\w&.\- ]{1,40}/,
    /\b(brand|marketing|partnerships?|influencer|talent|collab(oration)?)\s+(manager|team|department|coordinator|lead|specialist)\b/i
  ];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function mentionsToken(lower, token) {
    return new RegExp('(^|[^a-z0-9])' + escapeRe(token) + '([^a-z0-9]|$)', 'i').test(lower);
  }

  function sentences(text) {
    return text.replace(/([.!?])\s+/g, '$1\n').split(/\n+/);
  }

  // Common words scammers bolt onto a brand name to make a domain that reads as
  // official: nordvpn-partners, nordvpnpartners, sheincollabs.
  var LOOKALIKE_AFFIXES = ['partner', 'partners', 'collab', 'collabs', 'collaboration', 'collaborations',
    'team', 'official', 'support', 'creator', 'creators', 'sponsor', 'sponsors', 'sponsorship',
    'sponsorships', 'brand', 'brands', 'deal', 'deals', 'mail', 'hq', 'inc', 'llc', 'media', 'promo',
    'promos', 'marketing', 'ambassador', 'ambassadors', 'influencer', 'influencers', 'affiliate',
    'affiliates', 'campaign', 'campaigns', 'global', 'group', 'corp', 'app', 'agency', 'us', 'usa',
    'uk', 'pr', 'ads', 'business', 'verify', 'secure', 'login', 'help', 'care', 'contact', 'info',
    'news', 'io', 'program', 'programs', 'network', 'studio', 'studios', 'shop', 'store'];

  // Does a domain carry the brand token as its own word? Labels are split on
  // dots and dashes; the token must be a whole label, a label plus digits, or a
  // label glued to one of the affixes above. Platform brands need a whole label:
  // "youtubermgmt" is a talent agency, not YouTube.
  function domainCarriesToken(domain, token, strict) {
    var tok = token.replace(/[^a-z0-9]/g, '');
    if (tok.length < 4) return false;
    return domain.split(/[.-]/).some(function (label) {
      if (label === tok) return true;
      if (strict) return false;
      if (/^\d+$/.test(label.replace(tok, '')) && label.indexOf(tok) !== -1) return true;
      if (label.indexOf(tok) === 0) return LOOKALIKE_AFFIXES.indexOf(label.slice(tok.length)) !== -1;
      if (label.slice(-tok.length) === tok) return LOOKALIKE_AFFIXES.indexOf(label.slice(0, -tok.length)) !== -1;
      return false;
    });
  }

  // Header lines only: everything before the first blank line. The body can
  // say "spf=pass" all it likes.
  function headerBlock(text) {
    var end = text.search(/\n\s*\n/);
    return end === -1 ? text : text.slice(0, end);
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (item) {
      var key = String(item).toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function domainOf(address) {
    if (!address) return null;
    var m = String(address).match(/@([a-z0-9.-]+\.[a-z0-9-]{2,}|xn--[a-z0-9.-]+)/i);
    return m ? m[1].toLowerCase().replace(/\.$/, '') : null;
  }

  function registrable(domain) {
    if (!domain) return null;
    var parts = domain.split('.');
    if (parts.length <= 2) return domain;
    var sld = parts[parts.length - 2];
    var twoLevel = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne'];
    if (twoLevel.indexOf(sld) !== -1 && parts[parts.length - 1].length === 2) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  function sameOrg(a, b) {
    if (!a || !b) return false;
    return registrable(a) === registrable(b);
  }

  function isOfficial(domain, official) {
    var reg = registrable(domain);
    return official.some(function (o) { return o === reg || domain === o || domain.slice(-(o.length + 1)) === '.' + o; });
  }

  function extractHeader(text, name) {
    var re = new RegExp('^\\s*' + name + '\\s*:\\s*(.+)$', 'im');
    var m = text.match(re);
    return m ? m[1].trim() : null;
  }

  function extractAddresses(text) {
    return unique(text.match(/[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}/gi) || []).map(function (s) { return s.toLowerCase(); });
  }

  function extractUrls(text) {
    var raw = text.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) || [];
    return unique(raw.map(function (u) { return u.replace(/[.,;:!?]+$/, ''); }));
  }

  function urlHost(url) {
    var m = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').match(/^([^/?#:]+)/);
    return m ? m[1].toLowerCase() : '';
  }

  function extractAttachments(text) {
    var out = [];
    var isFileExt = function (ext) {
      return DANGEROUS_EXT.indexOf(ext) !== -1 || ARCHIVE_EXT.indexOf(ext) !== -1 || ['pdf', 'docx', 'doc', 'xlsx', 'pptx'].indexOf(ext) !== -1;
    };
    // An "Attachments:" line (what the extension appends from Gmail's chips,
    // or what a user pastes) lists real files by name, spaces and all.
    text = text.replace(/^\s*attachments?\s*:\s*(.+)$/gim, function (_line, list) {
      list.split(',').forEach(function (raw) {
        var name = raw.trim();
        var m = name.match(/\.([a-z0-9]{2,5})$/i);
        if (m && isFileExt(m[1].toLowerCase())) out.push({ name: name, ext: m[1].toLowerCase() });
      });
      return ' ';
    });
    text = text
      .replace(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi, ' ')
      .replace(/[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}/gi, ' ')
      .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|app|tv|me|ai|dev|uk|de|fr|ca|au|in)\b/gi, ' ');
    var names = text.match(/\b[\w\-. ()[\]]{1,80}\.([a-z0-9]{2,5})\b/gi) || [];
    names.forEach(function (n) {
      var ext = n.split('.').pop().toLowerCase();
      if (!isFileExt(ext)) return;
      if (/^(www|https?)\b/i.test(n) || /@/.test(n)) return;
      if (AMBIGUOUS_EXT.indexOf(ext) !== -1 && !looksLikeFile(n, text)) return;
      // In prose the match runs back over the sentence ("...is attached as
      // Agreement.scr"); the file name is the last word.
      out.push({ name: n.trim().split(/\s+/).pop(), ext: ext });
    });
    var seen = {};
    return out.filter(function (a) {
      var key = a.name.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function looksLikeFile(name, text) {
    var base = name.trim().split(/\s+/).pop();
    var stem = base.slice(0, base.lastIndexOf('.'));
    if (/[_\-\d]/.test(stem) || /\.[a-z0-9]{2,5}$/i.test(stem)) return true;
    return sentences(text).some(function (s) { return s.indexOf(base) !== -1 && FILE_CONTEXT.test(s); });
  }

  function extractMoney(text) {
    var found = [];
    var re = /(?:(\$|€|£|USD|EUR|GBP|CAD|AUD|INR|₹)\s?)(\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(k|K)?|(\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?|\d+)\s?(USD|EUR|GBP|CAD|AUD|dollars|euros|pounds)\b/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var amountStr = (m[2] || m[4] || '').replace(/,/g, '');
      var amount = parseFloat(amountStr);
      if (m[3]) amount *= 1000;
      if (!isNaN(amount) && amount > 0) found.push({ raw: m[0].trim(), amount: amount, currency: (m[1] || m[5] || '').toUpperCase() });
    }
    return found;
  }

  function extractDates(text) {
    var out = [];
    var re = /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;
    var m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return unique(out);
  }

  function extractDeliverables(text) {
    var out = [];
    var re = /\b(\d+|one|two|three|four|five|six|a|an)\s+(?:x\s+)?(dedicated|integrated|integration|sponsored|short[- ]form|long[- ]form|\d{1,3}[- ]?(?:second|sec|minute|min))?\s*(video|videos|integration|integrations|short|shorts|reel|reels|tiktok|tiktoks|story|stories|post|posts|stream|streams|mention|mentions|tweet|tweets|newsletter|podcast|episode|episodes|ad read|ad reads|pre-roll|mid-roll)\b/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      // "an integration in a long-form video" says where the integration goes,
      // not a second deliverable: an a/an/one right after a preposition is a
      // placement.
      var before = text.slice(Math.max(0, m.index - 12), m.index);
      if (/^(a|an|one)$/i.test(m[1]) && /\b(in|into|within|inside|during|on|of)\s+$/i.test(before)) continue;
      out.push({ text: m[0].replace(/\s+/g, ' ').trim(), count: m[1], noun: m[3] });
    }
    // "one video", "one dedicated video" and "1 dedicated video" in the same
    // email are one deliverable: group by count and noun, keep the most
    // specific wording.
    var words = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    var groups = {};
    var order = [];
    out.forEach(function (d) {
      var count = words[d.count.toLowerCase()] || Number(d.count);
      var noun = d.noun.toLowerCase().replace(/s$/, '');
      var key = count + ' ' + noun;
      if (!(key in groups)) order.push(key);
      if (!groups[key] || d.text.length > groups[key].length) groups[key] = d.text;
    });
    return order.map(function (k) { return groups[k]; });
  }

  function extractExclusivity(text) {
    var m = text.match(/\b(\d+)[- ]?(day|week|month|year)s?\s+(?:of\s+)?(?:category\s+)?exclusiv/i)
      || text.match(/exclusiv\w+\s+(?:for|of|period of)\s+(\d+)[- ]?(day|week|month|year)s?/i);
    if (m) return m[1] + ' ' + m[2] + (Number(m[1]) === 1 ? '' : 's');
    // Only exclusivity in the deal sense: "exclusivity", "category exclusive",
    // "exclusive for / period / rights". Scam and promo copy says "exclusive
    // code", "exclusive offer" or "exclusive access", which is not a term.
    if (/\bexclusivity\b|\b(category|competitor|industry|brand|product)[- ]exclusiv|\bexclusiv\w*\s+(for\b|period|window|rights?|clause|term|agreement|partner)/i.test(text)) {
      return 'mentioned, duration unclear';
    }
    return null;
  }

  function extractPaymentTerms(text) {
    var m = text.match(/\bnet[- ]?(\d{1,3})\b/i);
    if (m) return 'Net ' + m[1];
    if (/\b(upfront|up-front|in advance|50%\s*(deposit|upfront))\b/i.test(text)) return 'Upfront / deposit';
    if (/\b(on|upon|after)\s+(delivery|publication|posting|going live|approval)\b/i.test(text)) return 'On delivery / publication';
    if (/\b(30|60|90)\s+days\s+(after|from|following)\b/i.test(text)) return text.match(/\b(30|60|90)\s+days\s+(after|from|following)[^.\n]*/i)[0];
    return null;
  }

  function scoreToLevel(score) {
    if (score >= 12) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  var WEIGHTS = { info: 0, low: 1, medium: 3, high: 5, critical: 8 };

  function analyze(input) {
    var text = String(input || '').replace(/\r\n?/g, '\n');
    var findings = [];
    var add = function (id, severity, title, detail) {
      findings.push({ id: id, severity: severity, title: title, detail: detail });
    };

    var fromLine = extractHeader(text, 'From') || '';
    var replyLine = extractHeader(text, 'Reply-To') || '';
    var addresses = extractAddresses(text);
    var from = extractAddresses(fromLine)[0] || null;
    var replyTo = extractAddresses(replyLine)[0] || null;
    var fromDomain = domainOf(from);
    var replyToDomain = domainOf(replyTo);
    var bodyDomains = unique(addresses.map(domainOf).filter(Boolean));
    var candidateDomains = unique([fromDomain, replyToDomain].concat(bodyDomains).filter(Boolean));
    var urls = extractUrls(text);
    var hosts = unique(urls.map(urlHost).filter(Boolean));
    var lower = text.toLowerCase();

    // ---- brand detection -------------------------------------------------
    var brands = [];
    BRANDS.forEach(function (b) {
      var mentioned = !b.platformOnly && b.tokens.some(function (t) { return mentionsToken(lower, t); });
      var lookalike = null;
      candidateDomains.concat(hosts).forEach(function (d) {
        if (isOfficial(d, b.official)) return;
        var hit = b.tokens.some(function (t) { return domainCarriesToken(d, t, b.platformOnly); });
        if (hit && !lookalike) lookalike = d;
      });
      if (mentioned || lookalike) {
        var official = candidateDomains.filter(function (d) { return isOfficial(d, b.official); });
        brands.push({ name: b.name, official: b.official, matchedDomain: official[0] || null, lookalike: lookalike });
      }
    });

    brands.forEach(function (b) {
      if (b.lookalike) {
        add('brand_lookalike', 'critical', 'Lookalike domain for ' + b.name,
          b.lookalike + ' contains the brand name but is not a domain ' + b.name + ' sends from (' + b.official.slice(0, 2).join(', ') + '). This is the most common pattern in fake sponsorship pitches.');
      } else if (b.matchedDomain && fromDomain && isOfficial(fromDomain, b.official)) {
        add('brand_official', 'info', 'Sender domain matches ' + b.name,
          fromDomain + ' is a known ' + b.name + ' domain. Still confirm the person exists on LinkedIn or the brand\u2019s site.');
      } else if (fromDomain && !isOfficial(fromDomain, b.official) && FREE_MAIL.indexOf(registrable(fromDomain)) === -1) {
        add('brand_agency', 'low', b.name + ' mentioned, but sent from ' + fromDomain,
          'Agencies legitimately pitch on behalf of brands. Check that ' + registrable(fromDomain) + ' is a real agency with a website, staff on LinkedIn and this person listed.');
      }
    });

    // ---- sender checks ----------------------------------------------------
    if (fromDomain && FREE_MAIL.indexOf(registrable(fromDomain)) !== -1) {
      var claimsBrand = brands.length > 0 || SENDER_REPUTATION_PHRASES.some(function (re) { return re.test(text); });
      add('free_mail_sender', claimsBrand ? 'high' : 'medium', 'Sent from a free mailbox (' + registrable(fromDomain) + ')',
        claimsBrand
          ? 'A brand or agency employee pitching a paid partnership from a personal ' + registrable(fromDomain) + ' address is a strong scam signal. Real brand teams email from the company domain.'
          : 'Small brands sometimes use free mailboxes, but verify independently before sharing rates or opening files.');
    }
    if (fromDomain && replyToDomain && !sameOrg(fromDomain, replyToDomain)) {
      add('reply_to_mismatch', FREE_MAIL.indexOf(registrable(replyToDomain)) !== -1 ? 'high' : 'medium',
        'Reply-To goes to a different domain', 'From is ' + fromDomain + ' but replies go to ' + replyToDomain + '. Spoofed pitches use this so the conversation moves to a mailbox the scammer controls.');
    }
    if (candidateDomains.concat(hosts).some(function (d) { return /(^|\.)xn--/.test(d); })) {
      add('punycode', 'critical', 'Internationalised (punycode) domain', 'A domain starting with xn-- can display as a brand name using lookalike characters. Treat as hostile.');
    }
    // Authentication only counts from real header lines (before the first blank
    // line), so the body can't vouch for itself. A pass needs DMARC, or DKIM
    // signed by the sender's own domain; a platform signing on the brand's
    // behalf proves nothing about the brand.
    var authLines = headerBlock(text).split('\n').filter(function (l) {
      return /^\s*(arc-)?authentication-results\s*:|^\s*received-spf\s*:/i.test(l);
    }).join('\n');
    var authFail = authLines.match(/\b(spf|dkim|dmarc)\s*=\s*(fail|softfail|permerror|temperror|none)\b/ig);
    var dmarcPass = /\bdmarc\s*=\s*pass\b/i.test(authLines);
    var dkimDomains = [];
    authLines.replace(/\bdkim\s*=\s*pass\b[^;\n]*?\bheader\.(?:d|i)\s*=\s*@?([a-z0-9.-]+)/ig, function (_m, d) { dkimDomains.push(d.toLowerCase()); return _m; });
    var dkimAligned = fromDomain && dkimDomains.some(function (d) { return sameOrg(d, fromDomain); });
    if (authFail && authFail.length) {
      add('auth_fail', 'high', 'Email authentication failed', 'Headers show ' + unique(authFail).join(', ') + '. The message may not come from the domain it claims.');
    } else if (dmarcPass || dkimAligned) {
      add('auth_pass', 'info', 'Email authentication passed', (dmarcPass ? 'DMARC passed' : 'DKIM signed by ' + registrable(fromDomain)) + ' \u2014 the sending domain is genuine (though the domain itself may still be a lookalike).');
    }

    // ---- lure checks ------------------------------------------------------
    var attachments = extractAttachments(text);
    var dangerous = attachments.filter(function (a) { return DANGEROUS_EXT.indexOf(a.ext) !== -1; });
    var archives = attachments.filter(function (a) { return ARCHIVE_EXT.indexOf(a.ext) !== -1; });
    if (dangerous.length) {
      add('dangerous_attachment', 'critical', 'Executable file referenced',
        unique(dangerous.map(function (a) { return a.name; })).join(', ') + ' \u2014 a brief, contract or game build should never be an executable. Do not open.');
    }
    if (archives.length) {
      add('archive_attachment', ARCHIVE_PASSWORD.some(function (re) { return re.test(text); }) ? 'critical' : 'high',
        'Archive attachment (' + unique(archives.map(function (a) { return a.ext; })).join(', ') + ')',
        'Password-protected or plain archives bypass Gmail\u2019s virus scanning and are the standard delivery method for infostealers disguised as campaign briefs. Ask for a PDF or a link on the brand\u2019s own domain instead.');
    } else if (ARCHIVE_PASSWORD.some(function (re) { return re.test(text); })) {
      add('archive_password', 'critical', 'Password for a file is included', 'Sending the password with the file exists only to defeat malware scanning.');
    }
    var fileHostHits = hosts.filter(function (h) { return FILE_HOSTS.some(function (f) { return h === f || h.slice(-(f.length + 1)) === '.' + f || (h + '/').indexOf(f) === 0; }); })
      .concat(urls.filter(function (u) { return FILE_HOSTS.some(function (f) { return u.toLowerCase().indexOf(f) !== -1 && f.indexOf('/') !== -1; }); }));
    if (fileHostHits.length) {
      add('file_host', 'high', 'Files hosted on a sharing service', unique(fileHostHits).join(', ') + ' \u2014 brands share briefs from their own domain, Google Workspace or DocuSign, not anonymous file hosts.');
    }
    var shortHits = hosts.filter(function (h) { return SHORTENERS.indexOf(h) !== -1; });
    if (shortHits.length) {
      add('shortener', 'medium', 'Shortened link', unique(shortHits).join(', ') + ' hides the real destination. Expand it (or don\u2019t click) before trusting it.');
    }
    var loginHits = LOGIN_LURE.filter(function (re) { return re.test(text); });
    if (loginHits.length) {
      add('login_lure', 'critical', 'Asks you to sign in to view something', 'Credential phishing: a real contract never requires signing in with Google/YouTube. Never enter your Google password from a link in a pitch.');
    }
    var lureCopy = /\b(game (build|key|beta)|press kit|media kit|campaign (brief|assets|guidelines)|creative brief)\b/i.test(text);
    if (lureCopy && (archives.length || fileHostHits.length || shortHits.length)) {
      add('brief_lure', 'medium', '\u201cBrief / build\u201d bundled with a risky file', 'The combination of \u201cdownload the brief\u201d and an archive or file-host link is the exact template used in creator infostealer campaigns.');
    }

    // ---- social engineering ----------------------------------------------
    var greetingHits = GENERIC_GREETINGS.filter(function (re) { return re.test(text); });
    if (greetingHits.length) {
      add('generic_greeting', 'low', 'Generic greeting', 'No name, no channel reference. Mass-mailed pitches rarely turn into real deals and are often the first step of a scam funnel.');
    }
    var urgencyHits = URGENCY.filter(function (re) { return re.test(text); });
    if (urgencyHits.length) {
      add('urgency', urgencyHits.length > 1 ? 'medium' : 'low', 'Artificial urgency', 'Deadlines like \u201creply within 24 hours\u201d or \u201climited slots\u201d push you to skip verification.');
    }
    var payHit = sentences(text).some(function (s) {
      return !BRAND_PAYS.test(s) && PAY_TO_PLAY.some(function (re) { return re.test(s); });
    });
    if (payHit) {
      add('pay_to_play', 'critical', 'You are asked to pay something first', 'Real sponsors never ask creators for fees, deposits, shipping or to buy the product first. This is the advance-fee scam template.');
    }
    var offHits = OFF_PLATFORM.filter(function (re) { return re.test(text); });
    if (offHits.length) {
      add('off_platform', 'high', 'Crypto, gift cards or messaging apps', 'Payment in crypto/gift cards or moving the conversation to Telegram/WhatsApp is a red flag; brands pay by bank transfer, PayPal or platform escrow.');
    }
    var money = extractMoney(text);
    var big = money.filter(function (m) { return m.amount >= 5000; });
    if (big.length && (fromDomain === null || FREE_MAIL.indexOf(registrable(fromDomain)) !== -1 || greetingHits.length)) {
      add('too_good', 'medium', 'Unusually high offer for a cold pitch', big[0].raw + ' with no prior relationship and weak sender signals. Real budgets that size come with a brief, a named campaign and a contract.');
    }
    var nonAscii = (text.match(/[\u0400-\u04FF\u0370-\u03FF]/g) || []).length;
    if (nonAscii > 0 && /[a-z]/i.test(text) && nonAscii < text.length / 4) {
      add('mixed_script', 'medium', 'Mixed alphabets in text', 'Cyrillic or Greek characters mixed into English text are used to evade spam filters and to spoof brand names.');
    }

    // ---- positive signals -------------------------------------------------
    if (/\b(your (video|episode|short|reel|post|stream) (on|about|titled|called|where)|(loved|enjoyed|watched) your (video|episode|content) (on|about))\b/i.test(text)) {
      add('specific_reference', 'info', 'References specific content', 'Mentions a particular video or post \u2014 a sign the sender actually looked at your channel.');
    }
    if (/\b(calendly\.com|cal\.com|hubspot\.com\/meetings|zcal\.co)\b/i.test(text) || /\blinkedin\.com\/in\//i.test(text)) {
      add('booking_or_linkedin', 'info', 'Includes a booking link or LinkedIn', 'Easy to verify the person exists. Do check the LinkedIn profile actually lists the company.');
    }
    if (/\b(docusign|pandadoc|hellosign|dropbox sign|adobe sign)\b/i.test(text)) {
      add('esign', 'info', 'E-signature platform mentioned', 'Normal for real contracts \u2014 but open the e-sign link only if the sender email is the brand\u2019s or agency\u2019s real domain.');
    }

    // ---- deal terms -------------------------------------------------------
    var deliverables = extractDeliverables(text);
    var deadlines = extractDates(text);
    var exclusivity = extractExclusivity(text);
    var paymentTerms = extractPaymentTerms(text);
    var usageRights = [];
    USAGE_RIGHTS.forEach(function (u) {
      if (u.re.test(text)) {
        usageRights.push(u.label);
        if (u.severity !== 'info') {
          add('rights_' + u.label.toLowerCase().replace(/[^a-z]+/g, '_'), u.severity, u.label,
            u.severity === 'high'
              ? 'This grants far more than a sponsored post. Price it separately or strike it; standard is 6\u201312 months organic usage.'
              : 'Extra usage should be priced as a separate line item (typically +20\u201350% of the base fee).');
        }
      }
    });
    var rate = money.length ? money.sort(function (a, b) { return b.amount - a.amount; })[0] : null;
    var missing = [];
    var looksLikeOffer = /\b(sponsor|partnership|collab|campaign|brand deal|paid|budget|rate|fee|compensation)\b/i.test(text);
    if (looksLikeOffer) {
      if (!rate) missing.push('rate / budget');
      if (!deliverables.length) missing.push('deliverables');
      if (!deadlines.length) missing.push('timeline');
      if (!usageRights.length) missing.push('usage rights');
      if (!paymentTerms) missing.push('payment terms');
    }

    var score = findings.reduce(function (sum, f) { return sum + WEIGHTS[f.severity]; }, 0);
    var positives = findings.filter(function (f) { return f.id === 'brand_official' || f.id === 'auth_pass' || f.id === 'specific_reference'; }).length;
    score = Math.max(0, score - positives * 2);

    var order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    findings.sort(function (a, b) { return order[a.severity] - order[b.severity]; });

    // One critical finding (a lure, a lookalike, pay-to-play) is enough on its
    // own: positive signals can be faked, so they may not talk it down below
    // "high".
    var level = scoreToLevel(score);
    if (findings.some(function (f) { return f.severity === 'critical'; }) && (level === 'low' || level === 'medium')) level = 'high';
    var serious = findings.some(function (f) { return f.severity !== 'info'; });

    return {
      score: score,
      level: level,
      verified: level === 'low' && findings.some(function (f) { return f.id === 'brand_official' || f.id === 'auth_pass'; }),
      insufficient: !fromDomain && !serious,
      findings: findings,
      sender: { from: from, fromDomain: fromDomain, replyTo: replyTo, replyToDomain: replyToDomain },
      brands: brands,
      urls: urls,
      terms: {
        rate: rate ? rate.raw : null,
        deliverables: deliverables,
        deadlines: deadlines,
        exclusivity: exclusivity,
        usageRights: usageRights,
        paymentTerms: paymentTerms,
        missing: missing
      }
    };
  }

  var api = { analyze: analyze, BRANDS: BRANDS, version: '0.2.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SponsirChecker = api;
})(typeof window !== 'undefined' ? window : this);
