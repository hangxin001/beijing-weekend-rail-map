export interface ProvinceAnchor {
  province: string
  x: number
  y: number
}

export const PROVINCE_ANCHORS: ProvinceAnchor[] = [
  { province: '新疆', x: 22, y: 33 },
  { province: '西藏', x: 23.5, y: 55 },
  { province: '青海', x: 36, y: 47 },
  { province: '甘肃', x: 45, y: 43 },
  { province: '宁夏', x: 50, y: 45 },
  { province: '内蒙古', x: 56.5, y: 34 },
  { province: '黑龙江', x: 74.5, y: 17 },
  { province: '吉林', x: 77.5, y: 30 },
  { province: '辽宁', x: 74.5, y: 38.5 },
  { province: '北京', x: 66.4, y: 41.5 },
  { province: '天津', x: 67.5, y: 43.5 },
  { province: '河北', x: 64.5, y: 45 },
  { province: '山西', x: 60.5, y: 46.5 },
  { province: '陕西', x: 55, y: 52 },
  { province: '山东', x: 68.5, y: 49.5 },
  { province: '河南', x: 62.5, y: 54 },
  { province: '江苏', x: 69, y: 59 },
  { province: '安徽', x: 64.5, y: 61 },
  { province: '上海', x: 73, y: 63 },
  { province: '湖北', x: 57.5, y: 62 },
  { province: '重庆', x: 50, y: 63 },
  { province: '四川', x: 43.5, y: 62 },
  { province: '浙江', x: 69, y: 68.5 },
  { province: '江西', x: 61, y: 71 },
  { province: '湖南', x: 55.5, y: 69.5 },
  { province: '贵州', x: 48.5, y: 73 },
  { province: '云南', x: 40, y: 77 },
  { province: '福建', x: 63.5, y: 76.5 },
  { province: '广东', x: 58, y: 82 },
  { province: '广西', x: 50.5, y: 81.5 },
  { province: '海南', x: 54.5, y: 88.5 },
  { province: '香港', x: 60, y: 86 },
  { province: '澳门', x: 58.5, y: 86.5 },
  { province: '台湾', x: 70.5, y: 81.5 },
  { province: '其他', x: 90, y: 90 },
]

export function getAnchor(province: string): ProvinceAnchor {
  return (
    PROVINCE_ANCHORS.find((anchor) => anchor.province === province) ??
    PROVINCE_ANCHORS[PROVINCE_ANCHORS.length - 1]
  )
}
