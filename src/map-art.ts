import { mapDistanceAtY, mapHeight, mapRoadPose, mapWidth } from './map-route';

function path(d: string, stroke: string, width: number, dash = '') {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function streets(d: string) {
  return path(d, '#c5c5a7', 10) + path(d, '#fcf8e8', 7);
}

function river(d: string, width: number, color = '#50b9d7') {
  return path(d, '#85b078', width + 12) + path(d, '#318aa5', width + 3) + path(d, color, width) + path(d, '#95d9e6', 2, '9 37');
}

function roadTo(y: number, d: string) {
  const { x } = mapRoadPose(mapDistanceAtY(y));
  return streets(`${d} L${x.toFixed(1)} ${y}`);
}

function bridge(y: number) {
  const { x, angle } = mapRoadPose(mapDistanceAtY(y));
  return `<g transform="translate(${x.toFixed(1)} ${y}) rotate(${angle.toFixed(1)})">
    <rect x="-38" y="-20" width="76" height="40" rx="5" fill="#b7a487" stroke="#897a67" stroke-width="2"/>
    <path d="M-34-16H34M-34 16H34" fill="none" stroke="#efe4c7" stroke-width="2.5" stroke-dasharray="5 5"/>
  </g>`;
}

export function mapBridgeDetails(): string {
  const y = 724;
  const { x, angle } = mapRoadPose(mapDistanceAtY(y));
  const planks = Array.from({ length: 10 }, (_, i) => `M${-50 + i * 11} -27V27`).join('');
  return `<g transform="translate(${x.toFixed(1)} ${y}) rotate(${angle.toFixed(1)})">
    <rect x="-61" y="-32" width="122" height="65" rx="11" fill="#71543e"/>
    <rect x="-59" y="-28" width="118" height="56" rx="8" fill="#d4aa72"/>
    <path d="${planks}" fill="none" stroke="#a57650" stroke-width="2.3"/>
    <path d="M-52-30H52M-52 30H52" fill="none" stroke="#926344" stroke-width="7" stroke-linecap="round"/>
    <path d="M-52-32H52M-52 28H52" fill="none" stroke="#e0b87e" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

type Roof = readonly [x: number, y: number, width: number, height: number, angle?: number];
function buildings(roofs: readonly Roof[], colors: readonly string[]) {
  return roofs.map(([x, y, width, height, angle = 0], i) =>
    `<g transform="translate(${x} ${y}) rotate(${angle})">
      <rect x="-4" y="-4" width="${width + 8}" height="${height + 8}" rx="2" fill="#ece5c9"/>
      <rect width="${width}" height="${height}" rx="1.6" fill="${colors[i % colors.length]}" stroke="#675d5080" stroke-width="1"/>
      <path d="M2 ${height / 2}H${width - 2}" stroke="#fcf0d8" stroke-width="1.3"/>
    </g>`).join('');
}

type Tree = readonly [x: number, y: number, radius: number];
function woodland(trees: readonly Tree[], color = '#75a951', snowy = false) {
  return trees.map(([x, y, radius], index) => `<g transform="translate(${x} ${y}) scale(${radius / 12}) rotate(${index * 31 % 150})">
    <ellipse cx="1.9" cy="2.5" rx="13.5" ry="11.2" fill="#355b43" opacity=".21"/>
    <path d="M-12 2C-14-3-11-7-8-8Q-6-13 0-12Q5-13 8-8C13-8 15-3 12 2Q15 7 10 9Q7 13 3 11Q-2 14-6 10Q-11 12-12 7Q-14 5-12 2Z" fill="${color}" stroke="#4a7650" stroke-width=".9"/>
    <path d="M-10 1Q-10-5-6-6Q-3-11 2-9Q6-9 8-5Q5-5 4-2Q1-3-1 1Q-6-2-10 1Z" fill="${snowy ? '#f3f8f1' : '#cfe786'}" opacity="${snowy ? '.97' : '.53'}"/>
    </g>`).join('');
}

function meadow(d: string, color = '#b8d377') {
  return `<path d="${d}" fill="${color}" stroke="#94b56e80" stroke-width="1.5"/>`;
}

type Boulder = readonly [x: number, y: number, scale: number, angle: number];
function boulders(rocks: readonly Boulder[], snowy = false) {
  return rocks.map(([x, y, scale, angle]) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">
    <ellipse cx="1" cy="3" rx="14" ry="10" fill="#acad8d" opacity=".37"/>
    <path d="M-14 5L-11-4 -4-9 6-8 13-2 15 5 7 8 -4 9Z" fill="#9e9e8e" stroke="#7d8a7a" stroke-width="1"/>
    <path d="M-11-4L-4-9 6-8 13-2 6 1 -5 3 -14 5Z" fill="${snowy ? '#f0f9f6' : '#c8c4af'}"/>
  </g>`).join('');
}

function grassTufts(positions: readonly [x: number, y: number][]) {
  return `<path d="${positions.map(([x, y]) => `M${x} ${y}l-2-4m2 4V${y - 6}m0 6 3-3`).join('')}" fill="none" stroke="#81aa53" stroke-width="1.5" stroke-linecap="round" opacity=".68"/>`;
}

function cropPlot(x: number, y: number, width: number, height: number, angle: number, color = '#d9dfad') {
  const rows = Array.from({ length: Math.floor((height - 8) / 11) }, (_, row) =>
    `M5 ${10 + row * 11}H${width - 5}`).join('');
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <rect width="${width}" height="${height}" rx="5" fill="${color}" stroke="#acac76" stroke-width="1.5"/>
    <path d="${rows}" fill="none" stroke="#a8a860" stroke-opacity=".6" stroke-width="1.7"/>
  </g>`;
}

function orchard(x: number, y: number, columns: number, rows: number) {
  const trees: Tree[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) trees.push([x + column * 22, y + row * 23, 6 + ((row + column) % 3)]);
  }
  return woodland(trees, '#98b678');
}

const earth = ['#c98961', '#af6a55', '#cf9c6b'];
const slate = ['#71898c', '#857c91', '#b8a380'];
const russet = ['#c68353', '#aa7954', '#cb9b65'];

function mapleDepot() {
  return `
    ${meadow('M0 0H315Q306 48 270 82T205 115Q155 132 106 124T0 100Z', '#bed47a')}
    ${meadow('M531 71Q562 48 620 63V266Q573 256 548 211T531 71Z', '#a9c875')}
    ${streets('M322 14V149Q321 166 337 173H500M387 20V65H510M394 174V217H455')}
    ${roadTo(151, 'M501 129H410Q387 129 377 140H248')}
    ${buildings([[335,104,23,14],[369,105,24,15],[406,148,22,13],[441,149,19,13],[469,144,27,17],[344,186,32,20],[385,190,27,14],[503,98,29,17],[406,36,27,16],[450,40,23,12],[476,46,14,11]], earth)}
    ${cropPlot(40, 153, 70, 89, -9, '#d5deae')}
    ${woodland([[24,38,20],[50,31,17],[69,60,23],[96,55,14],[569,229,25],[591,202,20],[605,233,22],[585,260,17]], '#76a14d')}
    ${meadow('M2 253Q92 223 120 281T168 365L128 410 0 387Z')}
    ${woodland([[22,292,13],[47,279,13],[61,305,19],[89,311,12],[42,329,15],[22,351,12],[57,361,16],[87,371,11],[90,345,9],[112,392,12]])}
    ${streets('M440 283q-37 16-87 16m103 61q-34 12-78 9')}
    ${buildings([[453,279,24,16,-9],[482,283,16,13],[429,357,25,15],[459,359,22,11]], earth)}
    ${woodland([[525,315,32],[566,327,24],[550,366,19]], '#6c9f50')}
    ${boulders([[112,231,1.25,-7],[91,238,.64,18],[484,215,1.25,26],[599,304,.9,-19]])}
    ${grassTufts([[123,162],[97,211],[256,172],[291,161],[501,253],[579,282],[514,375],[201,353],[171,313],[228,398]])}
  `;
}

function cloverhill() {
  return `
    ${meadow('M450 417Q495 418 544 438T620 444V733Q546 706 487 722Q448 721 420 704Q410 678 426 632L456 584Z', '#dce294')}
    ${cropPlot(274, 460, 95, 110, -12)}
    ${cropPlot(465, 453, 110, 93, 7, '#e3d992')}
    ${cropPlot(428, 610, 78, 89, 11)}
    ${cropPlot(510, 594, 89, 114, -12, '#e3dd9f')}
    ${roadTo(546, 'M601 585Q558 560 504 568L436 565 380 550')}
    ${streets('M505 564L493 536M505 568L515 601M0 563L87 560 153 570')}
    ${buildings([[479,528,33,21,6],[523,531,21,16,10],[535,594,38,15,10],[454,574,27,17,9],[497,611,18,17],[43,528,27,16],[70,576,27,16]], russet)}
    ${orchard(54, 695, 5, 3)}
    ${woodland([[22,761,11],[51,765,11],[78,780,13],[103,770,9],[138,789,17],[171,788,13]])}
    ${woodland([[52,464,22],[83,476,16],[608,749,30],[573,771,23]], '#71a352')}
    ${boulders([[353,790,1.4,11],[331,803,.8,-18],[59,622,1.25,27]])}
    ${grassTufts([[73,510],[97,503],[134,639],[285,640],[247,591],[390,725],[560,740],[419,789],[233,806]])}
  `;
}

function brineport() {
  return `
    <path d="M0 846Q59 836 99 865L159 896Q202 919 191 956L169 990 125 1016 99 1088 0 1106Z" fill="#5ebbd3" stroke="#519d9d" stroke-width="3"/>
    <path d="M6 1003Q61 993 82 973T146 957M12 1030Q60 1024 96 1002" fill="none" stroke="#a5e6e4" stroke-width="2" stroke-dasharray="9 13"/>
    <path d="M115 895L133 892 145 911 148 925 118 940 105 931 125 920ZM73 924L95 926 105 947 88 957 75 949Z" fill="#c5a47c" stroke="#9e8567" stroke-width="2"/>
    <path d="M46 953L65 966 78 960 84 967 66 981 46 970 44 963Z" fill="#f3e7ca" stroke="#788887" stroke-width="2"/>
    <path d="M48 965L67 974 75 969" fill="none" stroke="#b4a689" stroke-width="2"/>
    ${roadTo(956, 'M145 899l33 10 43 25 73 19 55 4')}
    ${streets('M177 920l-7 45q-1 26 27 31l60 17 96 4m-125-80l-9 44 6 45m-28-25l-32 30-11 47m113-131l43-16 45 4')}
    ${buildings([[95,863,35,18,11],[177,877,32,21,22],[197,910,34,17,22],[182,958,28,17,6],[228,971,39,19,16],[272,991,29,17],[217,1018,35,19,7],[271,1029,41,24,-7],[305,924,33,18,3],[318,970,25,18,6]], slate)}
    ${meadow('M415 1062Q470 1013 523 1027L620 1065V1221L557 1235 473 1177Z')}
    ${woodland([[496,1091,17],[527,1095,14],[543,1119,18],[573,1119,12],[575,1149,21],[604,1132,14],[594,1175,15]])}
    ${boulders([[357,1098,1.48,-8],[371,1115,.88,19],[566,1230,1.47,33]])}
  `;
}

function sunfield() {
  return `
    ${meadow('M245 1266Q303 1234 401 1261Q471 1279 620 1215V1614Q561 1648 526 1629T445 1596Q419 1580 412 1535Q383 1514 268 1507Z', '#e7df91')}
    ${cropPlot(319, 1281, 135, 87, -9, '#ead7a0')}
    ${cropPlot(497, 1282, 101, 112, 8, '#e7d596')}
    ${cropPlot(431, 1452, 144, 84, -14, '#e6d69a')}
    ${cropPlot(304, 1452, 86, 106, 14, '#e3d8a3')}
    ${roadTo(1410, 'M608 1409Q570 1423 507 1407L395 1390 318 1397')}
    ${streets('M424 1395l-6 42m100-27q-2 26-19 48')}
    ${buildings([[378,1368,23,17,9],[445,1418,31,16,2],[479,1420,21,12],[520,1391,38,17,9],[559,1381,24,15],[539,1449,31,16,-13]], russet)}
    <g transform="translate(392 1430)">
      <circle r="18" fill="#dac598" stroke="#ad976c" stroke-width="2"/>
      <path d="M-17 0H17M0-17V17" stroke="#fff2d8" stroke-width="4"/>
      <path d="M-11-11L11 11M-11 11L11-11" stroke="#9d8a65" stroke-width="2"/>
      <circle r="5" fill="#a78354"/>
    </g>
    ${woodland([[47,1475,12],[66,1500,14],[87,1498,13],[94,1521,16],[58,1532,16],[19,1564,14],[36,1588,14]])}
    ${woodland([[64,1351,26],[87,1364,18],[44,1380,18]], '#84aa50')}
    ${boulders([[282,1490,1.42,12],[103,1575,.98,-27]])}
  `;
}

function alderPass() {
  return `
    <path d="M0 1597Q74 1617 141 1599Q209 1578 246 1625T345 1669Q404 1697 473 1627Q527 1575 620 1623V2014Q536 2048 464 2013T334 2003Q257 2034 195 2010T81 2046Q39 2077 0 2056Z" fill="#eaf5ef" stroke="#bdcfab" stroke-width="3"/>
    <path d="M0 1631Q102 1677 169 1693T223 1808Q208 1902 100 1932L0 1953Z" fill="#d3e7e2"/>
    <path d="M0 1685Q82 1705 125 1741T155 1847Q130 1890 0 1904Z" fill="#bcdbd6"/>
    <path d="M0 1743Q60 1745 78 1782T54 1850L0 1859Z" fill="#a5c9bd"/>
    <path d="M0 1631Q102 1677 169 1693T223 1808Q208 1902 100 1932L0 1953M0 1685Q82 1705 125 1741T155 1847Q130 1890 0 1904M0 1743Q60 1745 78 1782T54 1850L0 1859" fill="none" stroke="#86b2a6" stroke-width="1.65"/>
    ${roadTo(1793, 'M153 1791L217 1804Q237 1806 265 1790T358 1792')}
    ${streets('M220 1803l-9 39 10 15m31-65l-7-21-20-13m70 27l15 33 34 16')}
    ${buildings([[151,1773,25,17,7],[180,1811,23,17,17],[192,1841,27,18,20],[224,1749,28,16,16],[237,1812,28,17,-12],[294,1801,25,20,-11],[318,1820,24,17,11]], slate)}
    <path d="M485 1706Q504 1652 558 1656T620 1679V1776Q568 1755 533 1764T485 1706ZM460 1871Q510 1831 548 1841T620 1852V1936Q580 1925 535 1934T460 1871ZM129 1955Q140 1908 184 1911T226 1950Q202 1963 167 1974T129 1955Z" fill="#c8e1dd"/>
    ${woodland([[507,1707,16],[534,1683,20],[553,1707,25],[586,1680,22],[607,1688,12],[569,1730,16],[595,1734,22],[508,1854,19],[532,1869,23],[574,1860,23],[611,1868,19],[216,1961,20],[179,1955,17]], '#68a183', true)}
    ${boulders([[344,1682,2.06,6],[320,1691,1.15,-21],[62,1881,1.65,28],[494,1955,1.38,-13],[520,1967,.92,29],[292,2019,.8,-22]], true)}
    <path d="M76 1985Q97 1967 107 1983l-6 12-27 2ZM559 2015q17-19 30-11l10 17-31 5Z" fill="#f8fbf3" stroke="#d3e7e2" stroke-width="1.5"/>
  `;
}

function moonmere() {
  return `
    <path d="M68 2170Q122 2110 200 2135T279 2233Q270 2296 239 2332T130 2323Q66 2315 31 2264T68 2170Z" fill="#67bfd3" stroke="#559f9e" stroke-width="3"/>
    <path d="M105 2211q31-16 68-4m30 40q24-4 38-20m-145 53q24 12 54 13M61 2240q9-21 30-26" fill="none" stroke="#a8e1df" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M116 2258q12-15 29-8t20 25q-18 16-45 2Z" fill="#bacfa6"/>
    ${roadTo(2177, 'M68 2156q48-38 103-29l95 23 54 19')}
    ${streets('M247 2150l25-20 55 10m-34 23l-13 38 15 24m29-55l20 62 22 13')}
    ${buildings([[95,2126,24,15,-25],[133,2120,29,14,-6],[174,2131,27,18,15],[210,2138,29,17,18],[260,2117,34,19,10],[286,2190,23,15,17],[304,2219,28,16,18],[345,2232,23,15]], slate)}
    ${woodland([[21,2338,15],[45,2335,13],[66,2354,17],[86,2357,11],[111,2379,14],[138,2370,13],[18,2380,13],[40,2393,17],[67,2408,13],[94,2404,11],[35,2444,19],[70,2446,15]], '#a3bca0')}
    ${woodland([[577,2207,23],[597,2242,29],[574,2229,21],[611,2276,19]], '#73a15d')}
    ${boulders([[527,2322,1.33,17],[519,2341,.81,-9]])}
  `;
}

function bellSchool() {
  return `
    ${meadow('M364 2497Q407 2482 475 2490T620 2534V2705L560 2757 424 2730 390 2668Z', '#dce7bd')}
    ${roadTo(2600, 'M603 2616L520 2601H379L320 2612 269 2609')}
    ${streets('M386 2513V2643H549V2513M352 2542h222m-100 61v92m35-94v44')}
    <rect x="398" y="2554" width="91" height="40" rx="4" fill="#d6ccad" stroke="#c0ad8d" stroke-width="2"/>
    <path d="M410 2576H477M443 2559V2590" fill="none" stroke="#f7f0dd" stroke-width="2"/>
    <rect x="490" y="2651" width="94" height="49" rx="4" fill="#afd09f" stroke="#8eb48a" stroke-width="2"/>
    <path d="M499 2658H575V2693H499ZM537 2658V2693" fill="none" stroke="#eff5db" stroke-width="1.5"/>
    <circle cx="537" cy="2676" r="8" fill="none" stroke="#eff5db" stroke-width="1.5"/>
    ${buildings([[400,2520,88,20],[337,2558,30,24],[503,2549,31,19],[561,2570,32,21],[401,2613,34,19],[447,2618,22,16],[509,2618,26,18],[562,2625,30,15]], earth)}
    ${woodland([[28,2660,10],[48,2671,17],[72,2677,14],[111,2685,16],[91,2711,15],[49,2704,14],[22,2716,12],[67,2720,14],[123,2721,21]])}
    ${cropPlot(56, 2791, 118, 69, -12, '#d9dfad')}
  `;
}

function bramley() {
  return `
    ${meadow('M0 2838Q134 2876 227 2874T265 2942L252 3071Q235 3149 133 3126L0 3147Z', '#d0deb0')}
    ${orchard(35, 2901, 10, 3)}
    ${orchard(35, 3055, 9, 3)}
    ${cropPlot(28, 3158, 117, 103, 7, '#e6d8a4')}
    ${roadTo(2999, 'M29 2990Q102 2994 167 2993L244 3002 294 2997 354 3006')}
    ${streets('M69 2973l11 41 45 21m56-42l-6 44 45 17m30-51l-8 32 40 15m-102 8l-12 41')}
    ${buildings([[81,2972,29,18,3],[103,2982,25,15],[138,3020,28,18,1],[180,3019,35,19,13],[229,2981,29,17,9],[250,3015,26,18,17],[282,3052,30,18,16],[168,3054,31,18,16],[117,3041,22,15,19]], russet)}
    ${woodland([[499,3052,13],[522,3050,17],[536,3090,16],[555,3098,19],[575,3080,15],[593,3112,16],[612,3093,12],[520,3123,13],[547,3140,17],[576,3146,15]])}
  `;
}

function willowLock() {
  return `
    <path d="M412 3272L448 3277 449 3424 520 3501 514 3598 459 3629 450 3698 416 3696 433 3609 479 3581 485 3518 413 3436Z" fill="#62bad0" stroke="#5fa9a8" stroke-width="3"/>
    <path d="M430 3291V3431L501 3511 496 3589 445 3620 436 3679" fill="none" stroke="#abe2df" stroke-width="2" stroke-dasharray="8 10"/>
    <path d="M420 3439l27-18m40 103l25-19m-31 79l24 6" fill="none" stroke="#987d64" stroke-width="8"/>
    ${roadTo(3436, 'M411 3448L366 3406H280')}
    ${streets('M350 3402L361 3454 389 3470H445m-18-81l29 7 90-9m-2 98v57l28 30 54 6m-211-23l-32 9-39 58')}
    ${buildings([[349,3380,41,19,10],[376,3413,25,17,34],[343,3450,41,19,26],[386,3480,42,18,14],[481,3387,37,18,-9],[522,3405,35,18],[527,3537,39,24,8],[547,3573,50,18,16],[358,3577,37,18,-13]], slate)}
    ${meadow('M0 3339L99 3345 120 3421 70 3518 0 3531Z')}
    ${woodland([[16,3391,12],[39,3404,18],[63,3400,13],[82,3426,16],[40,3437,11],[13,3454,15],[61,3464,13],[83,3485,11]])}
  `;
}

function beaconBay() {
  return `
    <path d="M620 3674Q557 3691 534 3736T532 3803Q542 3831 512 3871T505 3950Q521 3971 504 3998L464 4077Q462 4107 437 4160H620Z" fill="#62b9d2" stroke="#559d9e" stroke-width="3"/>
    <path d="M569 3706q-30 48-15 86t-11 61m16 5q-32 47-25 69t-8 53q-31 53-28 100m78-102q-13 21-15 46" fill="none" stroke="#b1e5e4" stroke-width="2.2" stroke-dasharray="13 13"/>
    <path d="M569 3789q19-18 38-4l12 21v22q-45 14-65-13Z" fill="#c2d2a8" stroke="#91b4a4" stroke-width="3"/>
    <path d="M503 3904l27-7 4 8-28 10zm-4 43l23-6 5 8-24 7z" fill="#c0a482" stroke="#9e866e" stroke-width="2"/>
    ${roadTo(3909, 'M498 3916L459 3903H383L320 3916 251 3915')}
    ${streets('M462 3906l-33 30v56l-41 28m-34-115l3 55 25 27m39-54l72 7m-55-133l14 47 31 14')}
    ${buildings([[394,3877,28,17,13],[430,3875,35,16,5],[467,3890,22,15,11],[396,3925,21,16,3],[439,3916,25,18,-13],[455,3952,34,15,7],[399,3974,23,17,-11],[416,4003,21,17,-10],[389,3829,23,17,15],[432,3848,29,14,10]], earth)}
    <g transform="translate(473 4010)">
      <circle r="22" fill="#e2dcc1" stroke="#b3ad8c" stroke-width="2"/>
      <circle r="13" fill="#fbf7e9" stroke="#a86862" stroke-width="4"/>
      <circle r="7" fill="#aa6c65"/>
      <path d="M16-7l32-13 4 18-34 4" fill="#fdf3c4" opacity=".85"/>
    </g>
    ${woodland([[54,3827,11],[81,3814,16],[105,3815,14],[125,3833,15],[149,3819,14],[161,3864,13],[127,3859,13],[97,3878,17],[59,3878,16],[26,3870,15],[64,3924,17],[92,3929,15]])}
  `;
}

export function mapTerrain(): string {
  const upperStream = 'M507-24C525 80 499 160 473 220S445 328 426 383C395 455 438 505 432 555C417 623 355 657 300 724C264 768 248 817 221 848C178 910 131 941 100 968C56 1008 34 1049-27 1060';
  const lowerStream = 'M-25 1680C53 1700 85 1765 84 1812C81 1950 155 2050 157 2165C145 2210 131 2270 170 2340S238 2418 248 2455C281 2501 299 2501 318 2563C357 2642 330 2681 309 2722C293 2789 246 2824 282 2904C324 2956 346 3012 351 3061C351 3138 376 3181 393 3242C420 3300 435 3331 438 3370';
  return `
    <rect width="${mapWidth}" height="${mapHeight}" fill="#c8df87"/>
    <path d="M620 373Q559 404 531 461Q488 547 558 667T620 914V1234Q549 1219 513 1198T434 1194Q378 1219 317 1212T178 1167Q94 1129 0 1174V840Q68 861 107 839Q151 813 138 746T124 620Q142 577 106 515T0 481V411Q111 391 184 447T334 423Q404 387 472 389T620 373Z" fill="#d4e593"/>
    <path d="M0 1383Q111 1443 258 1389T620 1266V1673Q470 1678 394 1599T155 1569L0 1631ZM0 2013Q134 2010 276 2113T620 2130V2529Q500 2481 384 2489T170 2521L0 2459Z" fill="#b6d085"/>
    <path d="M0 2818Q132 2895 273 2885T620 2980V3361Q479 3335 390 3328T180 3269L0 3339ZM620 3523Q545 3498 473 3524T337 3632Q301 3721 190 3697T0 3688V3933Q67 3968 122 3958T233 3991Q297 4022 403 4004T620 3907Z" fill="#bdd47b"/>
    ${river(upperStream, 44)}
    ${mapleDepot()}
    ${cloverhill()}
    ${brineport()}
    ${sunfield()}
    ${alderPass()}
    ${river(lowerStream, 30, '#73c3d5')}
    ${moonmere()}
    ${bellSchool()}
    ${bramley()}
    ${willowLock()}
    ${beaconBay()}
    ${bridge(724)}
    ${bridge(2412)}
    ${bridge(2724)}
    ${bridge(3101)}
    ${bridge(3667)}
  `;
}
