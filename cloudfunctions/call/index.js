const tcb = require('@cloudbase/node-sdk')
const WXKEY = require('./key.json')
const WechatEncrypt = require('./util')

const cloud = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV
})
const db = cloud.database()

let xml = ''

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
      // 如果数据为ticket
      if (xml.indexOf('ComponentVerifyTicket') !== -1) {
        // 取出ticket数据
        const ticket = xml.slice(xml.indexOf('ticket@@@'), xml.indexOf(']]></ComponentVerifyTicket>'))
        // 存储ticket
        const upresult = await db.collection('wxid').doc('component_verify_ticket').update({
          time: db.serverDate(),
          value: ticket
        })
        console.log(upresult)
        // 如果存储不成功，证明第一次存储
        if (upresult.updated === 0) {
          // 添加存储数据
          const addresult = await db.collection('wxid').add({
            _id: 'component_verify_ticket',
            time: db.serverDate(),
            value: ticket
          })
          console.log(addresult)
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
    xml_msg: xml,
    msgSignature: msgSignature,
    nonce: nonce,
    wx_timestamp: timestamp,
    msgBody: msgBody
  })
  return res
}
