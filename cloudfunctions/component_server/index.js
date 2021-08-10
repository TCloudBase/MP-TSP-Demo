const api = require('./app/api.js')
const app = require('./app/app.js')

exports.main = async (event) => {
  console.log(event)
  if (event.type != null) {
    if (event.type === 'component_token') { // 获取第三方平台Token
      return await api.getComponentToken()
    }
    if (event.type === 'preauth_url') { // 获取预授权链接
      return await api.getPreAuthUrl()
    }
    if (event.type === 'confirm_auth') { // 确认授权状态（新增、更新）
      return await api.confirmAuth(event.code)
    }
    if (event.type === 'authorizer_token') { // 获取授权方主体Token（自动更新）
      return await api.getAuthorizerToken(event.appid)
    }
    if (event.type === 'authorizer_states') { // 获取授权方主体基础信息（授权时间，权限集合）
      return await api.getAuthorizerStates(event.appid)
    }
    if (event.type === 'get_appinfo') { // 获取应用信息
      return await app.getInfo()
    }
    if (event.type === 'save_appinfo') { // 保存应用信息
      return await app.saveInfo(event.data)
    }
    if (event.type === 'open_mess') { // 开通客服消息
      return await app.openMess()
    }
    if (event.type === 'com_checkState') { // 检查APPID环境
      return await app.com_checkState()
    }
    if (event.type === 'com_createEnv') { // 创建并绑定环境
      return await app.com_shareEnv()
    }
    if (event.type === 'com_deploytcb') { // 部署云开发资源
      return await app.com_deploytcb()
    }
    if (event.type === 'com_deployapp') { // 部署微信小程序
      return await app.com_deployapp()
    }
    if (event.type === 'get_userInfo') { // 获取客服消息用户头像
      return await app.get_userInfo(event.data.openid)
    }
    if (event.type === 'send_custommess') { // 发送客服消息
      return await app.sendCustomMess(event.data)
    }
  } else {
    return 404
  }
}
