

# 文件格式

黑板上的内容单独保存为板书文件，扩展名为edb。edb文件内部记录了版本号，以二进制文件进行保存。



## 白板图形元素定义

| **Shape Name** | **Shape Type** | **Description**                                  |
| -------------- | :------------: | ------------------------------------------------ |
| Traceline      |       0        | 线（或称为跟踪线、手绘线）                       |
| Rectangle      |       1        | 矩形                                             |
| Circle         |       2        | 圆形                                             |
| Text           |       3        | 文本                                             |
| Pixmap         |       4        | 图片                                             |
| Triangle       |       5        | 三角形（保留，未使用）                           |
| Ellipse        |       6        | 椭圆形                                           |
| SimpleLine     |       7        | 两点组成的直线段                                 |
| Square         |       8        | 正方形（保留，未使用，目前的正方形实际上是矩形） |
| Triangle       |       9        | 三角形                                           |
| PressureLine   |       10       | 压力线                                           |
| Polyline       |       13       | 自定义图形                                       |
| MarkPen        |       15       | 荧光笔                                           |
| CircleArc      |       16       | 圆弧                                             |
| ShapeGroup     |       20       | 组合图形                                         |
| TimePressureLine |     21       | 时间压力笔                                        |
| OddEvenLine    |       22       | 奇偶线(EDB暂时不需要实现)                           |
| ChalkLine      |       23       | 粉笔                                             |
| CoursewareLink |       30       | 课件资源链接                                      |
| EraserLine     |      100       | 橡皮擦    --EDB无需该类型                                       |
| Audio          |      200       | 音频（数据存储在edb文件内）--废弃                |
| Video          |      201       | 视频（数据存储在网络，只记录URL）--废弃          |
| TaskGood       |      210       | 赞                                               |
| AudioNew       |      211       | 音频（数据存储在edb文件内）                      |
| VideoNew       |      212       | 视频（数据存储在网络，只记录URL）                |


备注：

1 目前选曲线工具，再按ALT键画圆

2 目前选椭圆工具，再按SHIFT键画圆，实际上还是椭圆

3 目前选矩形工具，再按SHIFT键画正方形，实际上还是矩形

## Storage使用说明
所有需要使用文件的部分,均由三部分组成: StorageType/StorageDataLength/StorageData组成,其类型的对应关系如下:

StorageType取值范围:0/1(已废弃)/2/3/4/10

Type决定保存数据的类型,Length决定Data的长度

各Type值对应的Data含义
### 0-RawData
Data为二进制流

### 1-EDB内嵌资源ID(已废弃)
废弃,未实现过

### 2-全url
utf8编码字符串
示例: https://gl.eeo.im/uploads/-/system/project/avatar/17/icon_83.5_2x.png

### 3-云盘资源
utf8编码JSON字符串
示例: 

{
	"homework": {
		"fileID": "1111",
		"url": "http:///xxxx",
		"thumbnail": "upload/trans/av01/0f/93/68241/v360p/548d730be90060195404.png"
	},
	"cloudDisk": {
		"fileID": "2222",
		"url": "http://11321",
		"thumbnail": "upload/trans/av01/0f/93/68241/v360p/548d730be90060195404.png"
	},
	"cosFile": {
		"host": "https://cos.eeo.cn/",
		"url": "upload/image/1.png"
	}
}

实际JSON数据中请不要包含换行符和空格,这里只是为了方便阅读
在3个对象中,使用优先级 cosFile > homework > cloudDisk
homework和cloudDisk中的url不保证一定存在,若因为服务器文件迁移请使用fileID去从服务器请求最新信息

### 4-内置资源
Length长度固定为2,内容为uint16类型的数值
[0,100] 已废弃
[101,199] emoji表情
101--花心；102--大哭；103--破涕为笑；104--笑脸；105-晕；106--酷；107--指针；108--心；109--星星

[200,299] 作业特殊元素
200--对; 201--错; 210--赞

### 10-黑板临时Cos
utf8编码JSON串
{"bbImage":{"url":"http:///xxxx","isFullUrl":"1"}}

isFullUrl表示是否是全路径,若为false则需要接收端自行补域名(DNS域名)
url是对应的文件url,根据isFullUrl参数决定是否拼接DNS(来自于素材库的文件可能不带域名)



## 格式说明

每个文档都包含一个文件头、N个数据项和N个附加资源，每个数据又由数据项头和数据项内容组成，具体格式如下

| 序号 |                                        |            | 描述                                                         |
| ---- | -------------------------------------- | ---------- | ------------------------------------------------------------ |
| 1    |                                        | 文件头     | 具体说明见下节“文件头”                                       |
|      | **以下内容重复N次 **                   |            |                                                              |
| i+1  |                                        | 数据项头   | 具体说明见下节“文件头”                                       |
| i+2  |                                        | 数据项内容 | 图形元素定义中的一个，具体取值根据数据项头中的type，详细说明见“数据项内容” |
|      | <font color=red>以下内容重复N次</font> |            |                                                              |
|      |                                        | 资源文件   |                                                              |



### 文件头



| 参数           | 类型     | 字节数 | 值   | 描述                                  |
| -------------- | -------- | ------ | ---- | ------------------------------------- |
| IDlength       | uint32   | 4      |      | docId的长度                           |
| docId          | char     | 不定长度| edb  | 文件格式,字符串长度由IDlength决定        |
| version        | uint16   | 2      | ？？ | 版本号                                |
| pageNum        | uint16 | 2      | 50   | 总页数                                |
| itemNum        | uint32   | 4      |      | 图元个数                              |
| height | double | 8 |  | 每页的高度（默认值：590） |
| width | double | 8 |  | 宽度（默认值：1280） |
| resourceNum    | uint32   | 4      |      | <font color=red>附加资源的个数</font> |
| ClientType     | uint8    | 1      |      | 客户端类型 0-PC/1-iOS/2-Android                           |
| ClientVersionLength  | uint32    | 4      | N     | 客户端版本长度                            |
| ClientVersionStr  | Binary    | 变长 (N)     |      | 客户端版本描述                            |
| LastModifyTime | int64    | 8      |      | 最后修改时间戳(1970秒)                          |
| skinDataLength | uint32   | 4      |      | 皮肤数据长度,没有皮肤设置时长度为0,非0时时后续skin开头的属性的总长度值               |
| skinVersion    | uint8    | 1      |      | 皮肤数据版本                       |
| skinPositionX    | double | 8         |      | x坐标    |
| skinpositionY    | double | 8         |      | y坐标    |
| skinshowWidth    | double | 8         |      | 显示容器显示宽度,归一化后的值 |
| skinshowHeight   | double | 8         |      | 显示容器显示高度,归一化后的值 |
| skinImageType    | uint8  | 1         |      | 图片文件类型 0-JPEG/1-PNG/2...（预留字段，暂时不适用，值都为0） |
| skinStorageType  | uint8  | 1         |      | 详见Storage使用说明,可选值:3  |
| skinRotateAngle  | uint16 | 2         |      | 图片旋转角度, 0~359°, 该角度只影响pixmapData的数据方向,不影响skinPositionX/skinpositionY/skinshowWidth/skinshowHeight等坐标,在显示图片时先根据该角度旋转 |
| skinStorageDataLength   | int32  | 4         | N    | 详见Storage使用说明 |
| skinStorageData   | Binary | 变长（N） |      | 详见Storage使用说明 |

### 文件头(变更后version需要为50)


| 参数           | 类型     | 字节数 | 值   | 描述                                  |
| -------------- | -------- | ------ | ---- | ------------------------------------- |
| IDlength       | uint32   | 4      |      | docId的长度                           |
| docId          | char     | 不定长度| edb  | 文件格式,字符串长度由IDlength决定        |
| version        | uint16   | 2      | ？？ | 版本号                                |
| zipped         | uint8    | 1      |     | 后续的数据是否启用了zip压缩  |
| pageNum        | uint16   | 2      | 50   | 总页数                                |
| itemNum        | uint16   | 4      |      | 图元个数                              |
| height         | float    | 4 |  | 每页的高度（默认值：590） |
| width          | float    | 4 |  | 宽度（默认值：1280） |
| ClientType     | uint8    | 1      |      | 客户端类型 0-PC/1-iOS/2-Android                           |
| ClientVersionLength  | uint32    | 4      | N     | 客户端版本长度                            |
| ClientVersionStr  | Binary    | 变长 (N)     |      | 客户端版本描述                            |
| LastModifyTime | int64    | 8      |      | 最后修改时间戳(1970秒)                          |
| BackgroundColor | uint32  | 4      |      | 黑板的背景颜色,默认0x00000000全透明,后续在板书编辑器场景下使用         |

### 文件头皮肤部分
| 参数           | 类型     | 字节数 | 值   | 描述                                  |
| -------------- | -------- | ------ | ---- | ------------------------------------- |
| skinDataLength | uint32   | 4      |      | 皮肤数据长度,没有皮肤设置时长度为0,非0时时后续skin开头的属性的总长度值               |
| skinVersion    | uint8    | 1      |      | 皮肤数据版本                       |
| skinPositionX    | double  | 8         |      | x坐标    |
| skinpositionY    | double  | 8         |      | y坐标    |
| skinshowWidth    | double  | 8         |      | 显示容器显示宽度,归一化后的值 |
| skinshowHeight   | double  | 8         |      | 显示容器显示高度,归一化后的值 |
| skinImageType    | uint8  | 1         |      | 图片文件类型 0-JPEG/1-PNG/2...（预留字段，暂时不适用，值都为0） |
| skinStorageType  | uint8  | 1         |      | 详见Storage使用说明,可选值:3  |
| skinRotateAngle  | uint16 | 2         |      | 图片旋转角度, 0~359°, 该角度只影响pixmapData的数据方向,不影响skinPositionX/skinpositionY/skinshowWidth/skinshowHeight等坐标,在显示图片时先根据该角度旋转 |
| skinStorageDataLength   | uint32  | 4         | N    | 详见Storage使用说明 |
| skinStorageData   | Binary | 变长（N） |      | 详见Storage使用说明 |


### 数据项



每个数据项都有相同的数据项头

#### 数据项头

| 参数       | 类型     | 字节数 | 值   | 描述                                                         |
| ---------- | -------- | ------ | ---- | ------------------------------------------------------------ |
| type       | uint8    | 1      |      | 图元类型（见：白板图形元素定义）                             |
| dataLength | uint32   | 4      |      | <font color=red>数据长度（数据项头和数据项内容的总字节数）</font> |
| version    | uint8    | 1      |      | 图元的版本号                                                 |
| itemId     | char[16] | 16     |      | 图形元素唯一标识                                             |
| creatorUID | uint64   | 8      |      | 创建者的ID,default:0                                         |
| zvalue     | int32    | 4      |      | Z值：图元的绘制顺序（值大着后绘制）                          |
| status     | uint32   | 4      |      | 图形元素状态 0x0: 不锁定, 1 << 0: 全部锁定, 1 << 1: 大小锁定；1 << 2: 不使用笔锋效果 ; |
| rotate     | double   | 8      |      | 旋转参数                                                     |
| scaleX     | double   | 8      |      | X轴方向的缩放参数，值是否为1                                 |
| scaleY     | double   | 8      |      | Y轴方向的缩放参数，值是否为1                                 |


#### 数据项头(更改后)

| 参数       | 类型     | 字节数 | 值   | 描述                                                         |
| ---------- | -------- | ------ | ---- | ------------------------------------------------------------ |
| type       | uint8    | 1      |      | 图元类型（见：白板图形元素定义）                             |
| dataLength | uint32   | 4      |      | <font color=red>数据长度（数据项头和数据项内容的总字节数）</font> |
| version    | uint8    | 1      |      | 图元的版本号                                                 |
| itemId     | uint16   | 2      |      | 图形元素唯一标识,从0自增即可                                             |
| zvalue     | int32    | 4      |      | Z值：图元的绘制顺序（值大着后绘制）                          |
| status     | uint32   | 4      |      | 图形元素状态 0x0: 不锁定, 1 << 0: 全部锁定, 1 << 1: 大小锁定；1 << 2: 不使用笔锋效果; 1<< 3: 使用速度仿手写效果; |
| rotate     | float    | 4      |      | 旋转参数                                                     |
| scaleX     | float    | 4      |      | X轴方向的缩放参数，值是否为1                                 |
| scaleY     | float    | 4      |      | Y轴方向的缩放参数，值是否为1                                 |


#### 数据项内容

##### TraceLine



| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint32 |      4       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| PointNum             | uint32 |      4       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*8） |      | 点坐标串（x，y）              |

低版本使用小端，高版本使用大端

##### TraceLine(更改后)


| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束          |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束           |        |        |      |             |
| PragmaLength         | uint8  |     1  |      |  算法库参数长度              |
| BezierVersion        | uint8  |     1  |      |  算法版本              |
| SizeIndex            | uint8  |     1  |      |  字号              |
| EnablePressure       | uint8  |     1  |      |  是否开启压力              |
| PenType	           | uint8  |     1  |      |  笔类型              |
| TipPointNumber       | uint8  |     1  |      |  笔锋点个数              |
| TipFirstHalfScale    | float  |     4  |      |  笔锋参数:笔锋前半段系数         |
| TipSecondHalfScale   | float  |     4  |      |  笔锋参数:笔锋后半段系数         |
| MinPenWidthScale     | float  |     4  |      |  最小线宽倍率           |
| MaxPenWidthScale     | float  |     4  |      |  最大线宽倍率           |
| SpeedMinDistance     | float  |     4  |      |  最小速度参数           |
| SpeedMaxDistance     | float  |     4  |      |  最大速度参数           |
| FirstPointScale      | float  |     4  |      |  首个点的线宽系数              |

##### SimpleLine



| 参数      |  类型  | 字节数 | 值   | 描述                       |
| --------- | :----: | :----: | ---- | -------------------------- |
| LineWidth | uint32 |   4    |      | 线宽                       |
| LineColor | uint32 |   4    |      | 线颜色#RRGGBBAA            |
| LineStyleCount       | uint8  |   1    |  N   | 线型（偶数个的int）           |
| 以下内容重复N次  |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| PointNum | uint32 | 4 | 2 | 线包含的点数 |
| PointData | Binary |   8*4   |      | 点坐标串（x1，y1，x2，y2） |

##### SimpleLine(更改后)

| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束          |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束           |        |        |      |             |

##### Rectangle



| 参数      |  类型  | 字节数 | 值   | 描述                                           |
| --------- | :----: | :----: | ---- | ---------------------------------------------- |
| LineWidth | uint32 |   4    |      | 线宽                                           |
| LineColor | uint32 |   4    |      | 线颜色#RRGGBBAA                                |
| LineStyleCount       | uint8  |   1    |  N   | 线型（偶数个的int）           |
| 以下内容重复N次  |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| PointNum | uint32 | 4 | 2 | 线包含的点数 |
| PointData | Binary |   4*8   |      | 第一点是起点，第二点是对角点，两点确定一个矩形 |
| FillColor | uint32 |   4    |      | <font color=red>填充颜色#RRGGBBAA</font>       |

##### Rectangle(更改后)



| 参数      |  类型  | 字节数 | 值   | 描述                                           |
| --------- | :----: | :----: | ---- | ---------------------------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| FillColor            | uint32 |      4    |      | <font color=red>填充颜色#RRGGBBAA</font>       |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次  |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束       |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束       |        |        |      |             |


##### TaskGood



| 参数                 |  类型  | 字节数 | 值   | 描述                                           |
| -------------------- | :----: | :----: | ---- | ---------------------------------------------- |
| LineWidth            | uint32 |   4    |      | 线宽                                           |
| LineColor            | uint32 |   4    |      | 线颜色#RRGGBBAA                                |
| LineStyleCount       | uint8  |   1    | N    | 线型（偶数个的int）                            |
| 以下内容重复N次        |        |        |      | 包含SolidLength、BrokenLength                  |
| StyleValue           | uint8  |   1    |      | 实线、虚线交替的参数                           |
| PointNum             | uint32 |   4    | 2    | 线包含的点数                                   |
| PointData            | Binary |  4*8   |      | 第一点是起点，第二点是对角点，两点确定一个矩形 |
| FillColor            | uint32 |   4    |      | <font color=red>填充颜色#RRGGBBAA</font>       |

##### TaskGood(更改后)


与Rectangle相同

##### Triangle

| 参数                 |  类型  |    字节数     | 值   | 描述                                     |
| -------------------- | :----: | :-----------: | ---- | ---------------------------------------- |
| LineWidth            | uint32 |       4       |      | 线宽                                     |
| LineColor            | uint32 |       4       |      | 线颜色#RRGGBBAA                          |
| FillColor            | uint32 |       4       |      | <font color=red>填充颜色#RRGGBBAA</font> |
| LineStyleCount       | uint8  |       1       | N    | 线型（偶数个的int）                      |
| 以下内容重复N次  |        |               |      | 包含SolidLength、BrokenLength            |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| PointNum             | uint32 |       4       | 3    | 线包含的点数                             |
| PointData            | Binary | 变长（2x3x8） |      | 点坐标串（x，y）                         |

##### Triangle(更改后)


与Rectangle相同

##### Ellipse



| 参数      |  类型  | 字节数 | 值   | 描述                                                         |
| --------- | :----: | :----: | ---- | ------------------------------------------------------------ |
| LineWidth | uint32 |   4    |      | 线宽                                                         |
| LineColor | uint32 |   4    |      | 线颜色#RRGGBBAA                                              |
| LineStyleCount       | uint8  |   1    |  N   | 线型（偶数个的int）           |
| 以下内容重复N次  |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| PointNum | uint32 | 4 | 2 | 线包含的点数 |
| PointData | Binary |   4*8   |      | <font color=red>外接矩形的两个对角点，矩形确定一个椭圆</font> |
| FillColor | uint32 |   4    |      | <font color=red>填充颜色#RRGGBBAA</font>                     |

##### Ellipse(更改后)


与Rectangle相同

##### Circle



| 参数                 |  类型  | 字节数 | 值   | 描述                                                         |
| -------------------- | :----: | :----: | ---- | ------------------------------------------------------------ |
| LineWidth            | uint32 |   4    |      | 线宽                                                         |
| LineColor            | uint32 |   4    |      | 线颜色#RRGGBBAA                                              |
| LineStyleCount       | uint8  |   1    | N    | 线型（偶数个的int）                                          |
| 以下内容重复N次  |        |        |      | 包含SolidLength、BrokenLength                                |
| StyleValue           | uint8  |   1    |      | 实线、虚线交替的参数                                         |
| PointNum             | uint32 |   4    | 2    | 线包含的点数                                                 |
| PointData            | Binary |  4*8   |      | <font color=red>外接矩形的两个对角点，矩形确定一个椭圆</font> |
| FillColor            | uint32 |   4    |      | <font color=red>填充颜色#RRGGBBAA</font>                     |

##### Circle(更改后)


与Rectangle相同

##### Text



| 参数       | 类型   | 字节数    | 值   | 描述                     |
| ---------- | ------ | --------- | ---- | ------------------------ |
| positionX  | double | 8         |      | x坐标                    |
| positionY  | double | 8         |      | y坐标                    |
| fontSize   | uint32 | 4         |      | 文本大小                 |
| textColor  | uint32 | 4         |      | 文本颜色#RRGGBBAA        |
| Width      | double | 8         |      | 文本宽度（归一化后的值） |
| DataLength | uint32  | 4         | N    | 数据长度                 |
| textData   | Binary | 变长（N） |      | 具体内容                 |

##### Text(变更后)

| 参数       | 类型   | 字节数    | 值   | 描述                     |
| ---------- | ------ | --------- | ---- | ------------------------ |
| positionX  | float | 4         |      | x坐标                    |
| positionY  | float | 4         |      | y坐标                    |
| fontSize   | uint8 | 1         |      | 文本大小                 |
| textColor  | uint32 | 4         |      | 文本颜色#RRGGBBAA        |
| Width      | float | 4         |      | 文本宽度（归一化后的值） |
| DataLength | uint32 | 4        | N    | 数据长度                 |
| textData   | Binary | 变长（N） |      | 具体内容                 |

##### Pixmap



| 参数         | 类型   | 字节数    | 值   | 描述     |
| ------------ | ------ | --------- | ---- | -------- |
| positionX    | double | 8         |      | x坐标    |
| positionY    | double | 8         |      | y坐标    |
| showWidth    | double | 8         |      | 显示容器显示宽度,归一化后的值 |
| showHeight   | double | 8         |      | 显示容器显示高度,归一化后的值 |
| imageType    | uint8  | 1         |      | 图片文件类型 0-JPEG/1-PNG/2...（预留字段，暂时不适用，值都为0） |
| storageType  | uint8  | 1         |      | 详见Storage使用说明,可选值:0/2/3/4(EDB中不支持黑板临时cos文件,需要转为0)  |
| DataLength   | int32  | 4         | N    | 详见Storage使用说明 |
| StorageData   | Binary | 变长（N） |      | 详见Storage使用说明 |

##### Pixmap(变更后)


| 参数         | 类型   | 字节数    | 值   | 描述     |
| ------------ | ------ | --------- | ---- | -------- |
| positionX    | float | 4         |      | x坐标    |
| positionY    | float | 4         |      | y坐标    |
| showWidth    | float | 4         |      | 显示容器显示宽度,归一化后的值 |
| showHeight   | float | 4         |      | 显示容器显示高度,归一化后的值 |
| imageType    | uint8  | 1         |      | 图片文件类型 0-JPEG/1-PNG/2...（预留字段，暂时不适用，值都为0） |
| storageType  | uint8  | 1         |      | 详见Storage使用说明,可选值:0/2/3/4(EDB中不支持黑板临时cos文件,需要转为0)  |
| DataLength   | uint32 | 4         | N    | 详见Storage使用说明 |
| storageData   | Binary | 变长（N） |      | 详见Storage使用说明 |
| thumbnailLength | int32  | 4         | N    | 缩略图数据长度,需要考虑旧版本兼容,旧版本这里已经到末尾 |
| thumbnailData      | Binary | 变长（N）  |      | 缩略图只支持二进制流格式 |

##### PressureLine



| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint32 |      4       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| PointNum             | uint32 |      4       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（3N*8） |      | 点坐标串（x，y，pressure）    |

##### PressureLine(变更后)


| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（3N*4 每个点为float） |      | 点坐标串（x，y，pressure）    |
| PragmaLength         | uint8  |     1  |      |  算法库参数长度              |
| BezierVersion        | uint8  |     1  |      |  算法版本              |
| SizeIndex            | uint8  |     1  |      |  字号              |
| EnablePressure       | uint8  |     1  |      |  是否开启压力              |
| PenType	           | uint8  |     1  |      |  笔类型              |
| TipPointNumber       | uint8  |     1  |      |  笔锋点个数              |
| TipFirstHalfScale    | float  |     4  |      |  笔锋参数:笔锋前半段系数         |
| TipSecondHalfScale   | float  |     4  |      |  笔锋参数:笔锋后半段系数         |
| MinPenWidthScale     | float  |     4  |      |  最小线宽倍率           |
| MaxPenWidthScale     | float  |     4  |      |  最大线宽倍率           |
| SpeedMinDistance     | float  |     4  |      |  最小速度参数           |
| SpeedMaxDistance     | float  |     4  |      |  最大速度参数           |
| FirstPointScale      | float  |     4  |      |  首个点的线宽系数              |

##### Audio

| 参数           | 类型   | 字节数    | 值   | 描述                                                |
| -------------- | ------ | --------- | ---- | --------------------------------------------------- |
| positionX      | double | 8         |      | x坐标                                               |
| positionY      | double | 8         |      | y坐标                                               |
| showWidth      | double | 8         |      | 显示容器显示宽度,归一化后的值 |
| showHeight     | double | 8         |      | 显示容器显示高度,归一化后的值 |
| duration       | uint32 | 4         |      | 时长                                                |
| fileNameLength | int32  | 4         | N    | 文件名的长度                                        |
| fileName       | binary | 变长（N） |      | 文件名（包含后缀）；其他时为描述        |
| fileType       | uint8  | 1         |      | 音频文件类型 0-mp3/1... |
| storageType    | uint8  | 1         |      | 存储方式: 0-data为音频流/1-data为资源ID/2-data为url(全路径)/3-data为云盘资源ID  |
| dataLength     | int32  | 4         | N    | 数据的长度                                          |
| storageData    | binary | 变长（N） |      | 根据storageType解析 |

##### Audio(变更后)

| 参数           | 类型   | 字节数    | 值   | 描述                                                |
| -------------- | ------ | --------- | ---- | --------------------------------------------------- |
| positionX      | float | 4         |      | x坐标                                               |
| positionY      | float | 4         |      | y坐标                                               |
| showWidth      | float | 4         |      | 显示容器显示宽度,归一化后的值 |
| showHeight     | float | 4         |      | 显示容器显示高度,归一化后的值 |
| duration       | uint16 | 2         |      | 时长                                                |
| fileNameLength | uint32 | 4         | N    | 文件名的长度                                        |
| fileName       | binary | 变长（N） |      | 文件名（包含后缀）；其他时为描述        |
| fileType       | uint8  | 1         |      | 音频文件类型 0-mp3/1... |
| storageType    | uint8  | 1         |      | 详见Storage使用说明,可选值:2/3  |
| dataLength     | uint32  | 4         | N    | 数据的长度                                          |
| storageData    | binary | 变长（N） |      | 详见Storage使用说明 |

##### Video

| 参数           | 类型   | 字节数    | 值   | 描述                                                |
| -------------- | ------ | --------- | ---- | --------------------------------------------------- |
| positionX      | double | 8         |      | x坐标                                               |
| positionY      | double | 8         |      | y坐标                                               |
| showWidth      | double | 8         |      | 显示容器显示宽度,归一化后的值 |
| showHeight     | double | 8         |      | 显示容器显示高度,归一化后的值 |
| duration       | uint32 | 4         |      | 时长                                                |
| fileNameLength | int32  | 4         | N    | 文件名的长度                                        |
| fileName       | binary | 变长（N） |      | 文件名（包含后缀）        |
| fileType       | uint8  | 1         |      | 视频文件类型 0-mp4/1... |
| storageType    | uint8  | 1         |      | 详见Storage使用说明,可选值:2/3  |
| dataLength     | uint32  | 4         | N    | 数据的长度                                          |
| storageData    | binary | 变长（N） |      | 详见Storage使用说明 |

##### Video(变更后)

与Audio相同

##### Polyline(新增类型)

绘制方式是若干个点依次相连的图形,若FillColor不为0x00000000则需要闭合

| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| FillColor            | uint32 |       4       |      | <font color=red>填充颜色#RRGGBBAA</font> |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束          |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束           |        |        |      |             |
|IsVisble|uint8|1||是否显示|


##### MarkPen

| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束          |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束           |        |        |      |             |

##### CircleArc(新增类型)

| 参数                 |  类型  | 字节数 | 值   | 描述                          |
| -------------------- | :----: | :----: | ---- | ----------------------------- |
| LineWidth            | uint8  |   1    |      | 线宽                          |
| LineColor            | uint32 |   4    |      | 线颜色#RRGGBBAA               |
| FillColor            | uint32 |   4    |      | 填充颜色#RRGGBBAA             |
| centerPointX         | float  |   4    |      | 圆心x坐标                     |
| centerPointY         | float  |   4    |      | 圆心y坐标                     |
| radius               | float  |   4    |      | 半径 |
| startAngle           | float  |   4    |      | 起始角度,弧度制 |
| endAngle             | float  |   4    |      | 结束角度,弧度制 |
| clockwise            | uint8  |   1    | N    | 是否是顺时针方向         |
| strokeArc            | uint8  |   1    | N    | 是否绘制圆弧边             |
| strokeSide           | uint8  |   1    | N    | 是否绘制圆心点与圆弧端点连接的边      |
| LineStyleCount       | uint8  |   1    | N    | 线型（偶数个的int）           |
| 以下内容重复N次  |        |        |      | 包含SolidLength、BrokenLength |
| StyleValue           | uint8  |   1    |      | 实线、虚线交替的参数                   |
| 重复结束              |        |        |      |                    |


### 附加资源(已废弃)



| 参数       | 类型   | 字节数    | 值   | 描述                                   |
| ---------- | ------ | --------- | ---- | -------------------------------------- |
| type       | uint16 | 2         |      | 资源类型：0---音频、1---视频、2---图片 |
| ResourceID | uint32 | 4         |      | 资源ID                                 |
| dataLength | int32  | 4         | N    | 数据长度                               |
| data       | Binary | 变长（N） |      | 数据内容                               |


##### ShapeGroup(新增类型)

| 参数            | 类型   | 字节数    | 值   | 描述                                                         |
| --------------- | ------ | --------- | ---- | ------------------------------------------------------------ |
| shapeCode       | uint16 | 2         |      | 组合图形的code,需要将Code传入              |
| shapePositionX  | float  | 4        |      | x坐标仅保存,再次编辑时需要传给ShapeKit       |
| shapePositionY  | float  | 4         |      | y坐标仅保存,再次编辑时需要传给ShapeKit       |
| shapeWidth      | float  | 4         |      | 显示容器显示宽度,归一化后的值,再次编辑时需要传给ShapeKit       |
| shapeHeight     | float  | 4         |      | 显示容器显示高度,归一化后的值,再次编辑时需要传给ShapeKit       |
| rotate | float | 4 | | 角度 |
| LineWidth       | uint8  | 1         |      | 线宽                          |
| LineStyle       | uint8  | 1         |      | 线型                          |
| LineColor       | uint32 | 4         |      | 线颜色#RRGGBBAA                          |
| FillColor       | uint32 | 4         |      | 填充颜色#RRGGBBAA             |
| actionPointNum  | uint8  | 1         |      | 操作关键点位置  |
| 以下要素重复N次    |       |          |        |                   |
| isVisible       | uint8  | 1         |      | 是否是可见的点 |
| pointX          | float | 4         |      | x |
| pointY          | float | 4         |      | y |
| 重复内容结束      |        |        |      |             |
| subShapeIDCount | uint16 | 2         |      | 组合图形的子图形个数              |
| 以下要素重复N次 |       |          |        |                   |
| subItemId       | uint16 | 2      |      | 子图形元素唯一标识,从0自增即可                                          |
| 重复内容结束       |        |        |      |             |

需要注意,在edb中会先保存N个子图形,然后保存ShapeGroup去描述关系,而绘图指令时是先通过预发N个图元指令,然后再发送CTShapeInfo去绑定关系

##### CoursewareLnk(新增类型,还未开发)

| 参数           | 类型   | 字节数    | 值   | 描述                                                |
| -------------- | ------ | --------- | ---- | --------------------------------------------------- |
| positionX      | float | 8         |      | x坐标                                               |
| positionY      | float | 8         |      | y坐标                                               |
| showWidth      | float | 8         |      | 显示容器显示宽度,归一化后的值 |
| showHeight     | float | 8         |      | 显示容器显示高度,归一化后的值 |
| fileType       | uint8 | 1         |      | 课件类型,具体见后续内容 |
| fileNameLength | int32 | 4         | N    | 文件名的长度                                        |
| fileName       | binary | 变长（N） |      | 文件名（包含后缀）        |
| 文件封面开始      |        |        |      |             |
| storageType  | uint8  | 1         |      | 详见Storage使用说明,可选值:0/2/3/4  |
| DataLength   | int32  | 4         | N    | 数据长度 |
| storageData   | Binary | 变长（N） |      | 数据内容,根据storageType决定具体含义 |
| 文件封面结束      |        |        |      |             |
| jsonDataLength  | int32  | 4         | N    | 数据的长度                                          |
| jsonData        | binary | 变长（N） |      | 详见教室课件内容定义 |                                    |

filyType为类型定义
//该定义与ClassIn现有课件mole数据的协议部分相同,这里直接使用了
typedef NS_ENUM(NSUInteger,CloudResourceType) {
    CloudResourceType_PicPptWidget = 0,//不再使用
    CloudResourceType_HtmlPptWidget,//h5 ppt
    CloudResourceType_VideoWidget,//视频课件shap
    CloudResourceType_AudioWidget,//音频课件
    CloudResourceType_PdfWidget,//pdf课件
    CloudResourceType_CodeWidget,//文本编辑器
    CloudResourceType_CoursewareWidget,//webapp
    CloudResourceType_NewHtmlPptWidget,//ppt-i10
    CloudResourceType_WebPageWidget = 8,//edu
    CloudResourceType_Browse = 10,//浏览器(多向屏幕共享)
    CloudResourceType_VNC = 11,//VNC(多向屏幕共享)
    CloudResourceType_Homework,//作业讲解(多向屏幕共享)
    CloudResourceType_imageEditor = 14,//作业图片编辑器
    CloudResourceType_AppleMirror,//苹果投屏
    CloudResourceType_CloudImageEditor,//云盘图片编辑器
    CloudResourceType_htmlExcelWidget = 17,//H5 Excel课件
    CloudResourceType_EEOMirror = 18,//新投屏
    CloudResourceType_Exam = 19,//发布测验
    CloudResourceType_CloudExam = 20,//云盘打开的试题资源
    CloudResourceType_ExplainExam = 21,//讲解测验
    CloudResourceType_CloudPaper = 22,//云盘试卷资源
    CloudResourceType_EDoc = 23,//协作文档
    CloudResourceType_iPPTWidget = 24,//iPPT
};

##### TimePressureLine(20220421新增类型)

| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（4N*4 值均为float） |      | 点坐标串（x，y，pressure, time）    |

##### ChalkLine(20231024新增类型)

| 参数                 |  类型  |    字节数    |  值  | 描述                          |
| -------------------- | :----: | :----------: | :--: | ----------------------------- |
| LineWidth            | uint8  |      1       |      | 线宽                          |
| LineColor            | uint32 |      4       |      | 线颜色#RRGGBBAA               |
| LineStyleCount       | uint8  |      1       |  N   | 线型（偶数个的int）           |
| 以下内容重复N次        |        |              |      | 包含SolidLength、BrokenLength |
| StyleValue          | uint8  |      1       |      | 实线、虚线交替的参数                   |
| 重复内容结束          |        |        |      |             |
| PointNum             | uint16 |      2       |  N   | 线包含的点数                  |
| PointData            | Binary | 变长（2N*4  坐标点float即可） |      | 点坐标串（x，y）              |
| 重复内容结束           |        |        |      |             |

