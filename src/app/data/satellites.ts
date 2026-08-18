export interface Satellite {
  id: string;
  name: string;
  provider: string;
  providerEn: string;
  country: string; // ISO-ish label
  countryZh: string;
  origin: 'cn' | 'intl';
  type: 'optical' | 'sar' | 'multispectral' | 'video';
  bestResolution: number; // meters
  revisit: string; // revisit period label
  commercial: boolean;
}

export const SATELLITES: Satellite[] = [
  { id: 'jl1', name: '吉林一号', provider: '长光卫星', providerEn: 'CGSTL', country: 'China', countryZh: '中国', origin: 'cn', type: 'optical', bestResolution: 0.5, revisit: '1 day', commercial: true },
  { id: 'sv1', name: '高景一号', provider: '中国四维', providerEn: 'SpaceView', country: 'China', countryZh: '中国', origin: 'cn', type: 'optical', bestResolution: 0.5, revisit: '2 days', commercial: true },
  { id: 'svneo', name: 'SuperView Neo', provider: '中国四维', providerEn: 'SpaceView', country: 'China', countryZh: '中国', origin: 'cn', type: 'optical', bestResolution: 0.3, revisit: '1 day', commercial: true },
  { id: 'bj3', name: '北京三号', provider: '二十一世纪空间', providerEn: '21AT', country: 'China', countryZh: '中国', origin: 'cn', type: 'optical', bestResolution: 0.5, revisit: '2 days', commercial: true },
  { id: 'lj1', name: '珞珈一号', provider: '武汉大学', providerEn: 'Luojia', country: 'China', countryZh: '中国', origin: 'cn', type: 'optical', bestResolution: 100, revisit: '15 days', commercial: false },
  { id: 'hs1', name: '海丝一号', provider: '天仪研究院', providerEn: 'Spacety', country: 'China', countryZh: '中国', origin: 'cn', type: 'sar', bestResolution: 1, revisit: '3 days', commercial: true },
  { id: 'wv3', name: 'WorldView-3', provider: 'Maxar', providerEn: 'Maxar', country: 'USA', countryZh: '美国', origin: 'intl', type: 'optical', bestResolution: 0.31, revisit: '1 day', commercial: true },
  { id: 'wvl', name: 'WorldView Legion', provider: 'Maxar', providerEn: 'Maxar', country: 'USA', countryZh: '美国', origin: 'intl', type: 'optical', bestResolution: 0.3, revisit: '<1 day', commercial: true },
  { id: 'pneo', name: 'Pléiades Neo', provider: 'Airbus', providerEn: 'Airbus', country: 'France', countryZh: '法国', origin: 'intl', type: 'optical', bestResolution: 0.3, revisit: '2 days', commercial: true },
  { id: 'psc', name: 'PlanetScope', provider: 'Planet', providerEn: 'Planet', country: 'USA', countryZh: '美国', origin: 'intl', type: 'multispectral', bestResolution: 3, revisit: 'daily', commercial: true },
  { id: 'sksat', name: 'SkySat', provider: 'Planet', providerEn: 'Planet', country: 'USA', countryZh: '美国', origin: 'intl', type: 'optical', bestResolution: 0.5, revisit: 'daily', commercial: true },
  { id: 's1', name: 'Sentinel-1', provider: 'ESA', providerEn: 'ESA', country: 'EU', countryZh: '欧盟', origin: 'intl', type: 'sar', bestResolution: 5, revisit: '6 days', commercial: false },
  { id: 's2', name: 'Sentinel-2', provider: 'ESA', providerEn: 'ESA', country: 'EU', countryZh: '欧盟', origin: 'intl', type: 'multispectral', bestResolution: 10, revisit: '5 days', commercial: false },
  { id: 'ls9', name: 'Landsat 9', provider: 'USGS/NASA', providerEn: 'USGS/NASA', country: 'USA', countryZh: '美国', origin: 'intl', type: 'multispectral', bestResolution: 15, revisit: '16 days', commercial: false },
  { id: 'iceye', name: 'ICEYE', provider: 'ICEYE', providerEn: 'ICEYE', country: 'Finland', countryZh: '芬兰', origin: 'intl', type: 'sar', bestResolution: 0.5, revisit: '<1 day', commercial: true },
  { id: 'capella', name: 'Capella', provider: 'Capella Space', providerEn: 'Capella', country: 'USA', countryZh: '美国', origin: 'intl', type: 'sar', bestResolution: 0.5, revisit: '<1 day', commercial: true },
];

export function getSatellite(id: string): Satellite | undefined {
  return SATELLITES.find((s) => s.id === id);
}
