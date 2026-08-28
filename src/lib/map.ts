export interface ProvinceAnchor {
  province: string
  x: number
  y: number
}

export const PROVINCE_ANCHORS: ProvinceAnchor[] = [
  { province: '新疆', x: 15, y: 29 },
  { province: '西藏', x: 22, y: 55 },
  { province: '青海', x: 34, y: 42 },
  { province: '甘肃', x: 43, y: 37 },
  { province: '宁夏', x: 50, y: 38 },
  { province: '内蒙古', x: 55, y: 23 },
  { province: '黑龙江', x: 88, y: 15 },
  { province: '吉林', x: 87, y: 27 },
  { province: '辽宁', x: 81, y: 34 },
  { province: '北京', x: 72, y: 35 },
  { province: '天津', x: 76, y: 39 },
  { province: '河北', x: 69, y: 42 },
  { province: '山西', x: 60, y: 43 },
  { province: '陕西', x: 53, y: 51 },
  { province: '山东', x: 73, y: 49 },
  { province: '河南', x: 63, y: 53 },
  { province: '江苏', x: 76, y: 58 },
  { province: '安徽', x: 68, y: 61 },
  { province: '上海', x: 82, y: 63 },
  { province: '湖北', x: 59, y: 62 },
  { province: '重庆', x: 49, y: 63 },
  { province: '四川', x: 40, y: 60 },
  { province: '浙江', x: 76, y: 69 },
  { province: '江西', x: 65, y: 71 },
  { province: '湖南', x: 56, y: 70 },
  { province: '贵州', x: 47, y: 72 },
  { province: '云南', x: 37, y: 77 },
  { province: '福建', x: 70, y: 77 },
  { province: '广东', x: 59, y: 82 },
  { province: '广西', x: 50, y: 82 },
  { province: '海南', x: 56, y: 93 },
  { province: '香港', x: 63, y: 86 },
  { province: '澳门', x: 60, y: 87 },
  { province: '台湾', x: 76, y: 82 },
  { province: '其他', x: 90, y: 90 },
]

export function getAnchor(province: string): ProvinceAnchor {
  return (
    PROVINCE_ANCHORS.find((anchor) => anchor.province === province) ??
    PROVINCE_ANCHORS[PROVINCE_ANCHORS.length - 1]
  )
}
