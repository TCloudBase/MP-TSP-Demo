const tcb = require('@cloudbase/node-sdk')
const WXKEY = require('./key.json')
const WechatEncrypt = require('./util')
const request = require('request')
const fs = require('fs')
const path = require('path')

const cloud = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

let xml = ''

function apiGetimg (url) {
  return new Promise((resolve, reject) => {
    request({
      url,
      method: 'GET'
    }, (error, response) => {
      if (error) {
        reject(error)
      }
      resolve(response.body)
    }).pipe(fs.createWriteStream(path.join('/tmp', 'image.png')))
  })
}

exports.main = async (event) => {
  let res = {}
  const msgBody = event.body
  const { msgSignature, nonce, timestamp } = event.queryStringParameters
  if (msgSignature != null) {
    // 对信息进行base64处理
    const encryptedMsg = Buffer.from(msgBody, 'base64').toString()
    // 读取Encrypt中DATA信息
    const encrypt = encryptedMsg.slice(encryptedMsg.indexOf('<Encrypt><![CDATA[') + 18, encryptedMsg.indexOf(']]></Encrypt>'))
    // 初始化解密函数对象
    const wechatEncrypt = new WechatEncrypt(WXKEY)
    // 对消息进行签名处理
    const signature = wechatEncrypt.genSign({ timestamp, nonce, encrypt })
    // 判断签名是否和传入签名一致，安全
    if (signature === msgSignature) {
      // 正式解密数据
      xml = wechatEncrypt.decode(encrypt)
      // 处理解密信息，获取消息类型
      const messtype = xml.slice(xml.indexOf('MsgType><![CDATA[') + 17, xml.indexOf(']]></MsgType'))
      // 消息类型如果是文字或者图片，符合要求
      if (['text', 'image'].indexOf(messtype) !== -1) {
        // 获取请求path路径上类型
        const resolveType = event.path.slice(event.path.lastIndexOf('/') + 1)
        // 获取请求path路径上appid
        const appid = event.path.slice(1, event.path.lastIndexOf('/'))
        // 构造消息对象
        const messItem = {}
        messItem.openid = xml.slice(xml.indexOf('FromUserName><![CDATA[') + 22, xml.indexOf(']]></FromUserName'))
        messItem.time = xml.slice(xml.indexOf('<CreateTime>') + 12, xml.indexOf('</CreateTime>'))
        messItem.type = messtype
        if (messtype === 'text') messItem.content = xml.slice(xml.indexOf('<Content><![CDATA[') + 18, xml.indexOf(']]></Content'))
        else {
          messItem.content = xml.slice(xml.indexOf('PicUrl><![CDATA[') + 16, xml.indexOf(']]></PicUrl'))
          await apiGetimg(messItem.content)
          const { fileID } = await cloud.uploadFile({ cloudPath: `messimg/${appid}/${messItem.openid}/${messItem.time}.png`, fileContent: fs.createReadStream(path.join('/tmp', 'image.png')) })
          messItem.content = fileID
        }
        // 如果类型为call（这是一个校验，可以去掉，需要保证设置的监听url能对的上号）
        if (resolveType === 'call') {
          // 存储消息
          await db.collection('mess').doc(appid).update({
            chat_list: {
              [messItem.openid]: _.push([messItem])
            }
          })
        }
      }
      res = 'success'
    } else {
      res = 'error'
    }
  } else {
    res = 404
  }
  cloud.logger().log({
    path: event.path,
    xml_msg: xml,
    msgSignature: msgSignature,
    nonce: nonce,
    wx_timestamp: timestamp,
    msgBody: msgBody
  })
  return res
}
