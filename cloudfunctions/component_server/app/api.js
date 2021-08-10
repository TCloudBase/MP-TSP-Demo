const tcb = require('@cloudbase/node-sdk')
const api = require('../util/http.js')
const { component_appid, redirect_uri } = require('../config/key.json')
const authkey = require('../util/authkey.json')
const custom_key = require('../config/tcb_custom_login.json')

const cloud = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
  credentials: custom_key
})
const db = cloud.database()

/**
 * 获取第三方平台access_token
 */
async function getComponentToken () {
  let accessToken = null
  let dataTicket = null
  let apiComponentResult = null
  const res = {}

  let dataComponent = (await db.collection('wxid').doc('component_access_token').get()).data

  if (dataComponent.length !== 0) {
    dataComponent = dataComponent[0]
    const overtime = new Date((new Date()).valueOf() + 60 * 1000)
    if (dataComponent.time > overtime) {
      accessToken = dataComponent.value
    } else {
      console.log('timeout token!')
    }
  } else {
    console.log('no save token!')
  }

  if (accessToken == null) {
    dataTicket = (await db.collection('wxid').doc('component_verify_ticket').get()).data
    if (dataTicket.length !== 0) {
      dataTicket = dataTicket[0]
      apiComponentResult = await api.api_component_token(dataTicket.value)

      if (apiComponentResult.indexOf('component_access_token') != -1) {
        const { component_access_token, expires_in } = JSON.parse(apiComponentResult)
        accessToken = component_access_token

        const saveData = {
          time: db.serverDate({
            offset: expires_in * 1000
          }),
          value: component_access_token
        }

        const upresult = await db.collection('wxid').doc('component_access_token').update(saveData)
        if (upresult.updated === 0) {
          await db.collection('wxid').add({ _id: 'component_access_token', ...saveData })
        }
      } else {
        console.log('wxcall failed！=======>\n', apiComponentResult)
        res.msg = 'wxcall failed！'
      }
    } else {
      console.log('no save ticket!')
      res.msg = 'no save ticket!'
    }
  }

  res.access_token = accessToken
  cloud.logger().log({
    ...res,
    dataComponent,
    dataTicket,
    apiComponentResult
  })
  return res
}

/**
 * 获取第三方平台预授权Url链接
 */
async function getPreAuthUrl () {
  const res = {}
  const apiRes = await getComponentToken()
  if (apiRes.access_token != null) {
    const authUrl = null
    const apiPreauthcoderesult = await api.api_create_preauthcode(apiRes.access_token)
    if (apiPreauthcoderesult.indexOf('pre_auth_code') !== -1) {
      const { pre_auth_code } = JSON.parse(apiPreauthcoderesult)
      res.url = `https://mp.weixin.qq.com/cgi-bin/componentloginpage?component_appid=${component_appid}&pre_auth_code=${pre_auth_code}&redirect_uri=${redirect_uri}`
    } else {
      res.msg = 'wxcall failed!'
    }
    cloud.logger().log({
      apiPreauthcoderesult,
      authUrl
    })
  } else {
    res.msg = 'component_token is failed!'
  }
  return res
}

/**
 * 根据授权码code确认授权信息
 */
async function confirmAuth (code) {
  const res = {}
  const apiRes = await getComponentToken()
  if (apiRes.access_token != null) {
    const apiQueryresult = await api.api_query_auth(apiRes.access_token, code)
    if (apiQueryresult.indexOf('authorization_info') != -1) {
      const { authorization_info } = JSON.parse(apiQueryresult)
      const { authorizer_access_token, authorizer_appid, authorizer_refresh_token, expires_in, func_info } = authorization_info
      const saveData = {
        func_info,
        access_token: authorizer_access_token,
        time: db.serverDate({ offset: expires_in * 1000 }),
        appid: authorizer_appid,
        refresh_token: authorizer_refresh_token,
        updatedue: db.serverDate()
      }
      const upresult = await db.collection('mini').doc(authorizer_appid).update(saveData)
      if (upresult.updated === 0) {
        await db.collection('mini').add({ _id: authorizer_appid, ...saveData, createdue: db.serverDate() })
      }
      res.appid = authorizer_appid
      res.ticket = cloud.auth().createTicket(authorizer_appid, {
        refresh: 30 * 60 * 1000
      })
    } else {
      res.msg = 'wxcall failed!'
    }
    cloud.logger().log({
      apiQueryresult
    })
  } else {
    res.msg = 'component_token is failed!'
  }
  return res
}

/**
 * 根据APPID获取授权者access_token
 * @param {*} appid
 */
async function getAuthorizerToken (appid) {
  let api_authorizer_result = null
  const res = {}
  let data_authorizer = (await db.collection('mini').doc(appid).get()).data
  if (data_authorizer.length !== 0) {
    data_authorizer = data_authorizer[0]
    const { access_token, time, refresh_token } = data_authorizer
    const overtime = new Date((new Date()).valueOf() + 60 * 1000)
    if (time > overtime) {
      res.access_token = access_token
    } else {
      const apiRes = await getComponentToken()
      if (apiRes.access_token != null) {
        api_authorizer_result = await api.api_authorizer_token(refresh_token, apiRes.access_token, appid)
        if (api_authorizer_result.indexOf('authorizer_access_token') !== -1) {
          const { authorizer_access_token, authorizer_refresh_token, expires_in } = JSON.parse(api_authorizer_result)
          const saveData = {
            access_token: authorizer_access_token,
            time: db.serverDate({ offset: expires_in * 1000 }),
            refresh_token: authorizer_refresh_token
          }
          await db.collection('mini').doc(appid).update(saveData)
          res.access_token = authorizer_access_token
        } else {
          res.msg = 'wxcall failed!'
        }
      } else {
        res.msg = 'component_token is failed!'
      }
    }
  } else {
    res.msg = 'no found appid!'
  }
  res.from_appid = component_appid
  cloud.logger().log({
    api_authorizer_result,
    data_authorizer
  })
  return res
}

/**
 * 根据APPID获取授权状态，包括授权列表等
 * @param {*} appid
 */
async function getAuthorizerStates (appid) {
  const res = {}
  const data_authorizer = (await db.collection('mini').doc(appid).get()).data
  if (data_authorizer.length !== 0) {
    const { createdue, updatedue, func_info } = data_authorizer[0]
    const func_list = {}
    for (const item of func_info) {
      func_list[item.funcscope_category.id] = authkey[item.funcscope_category.id]
    }
    res.result = {
      appid,
      createdue,
      updatedue,
      func_list
    }
  } else {
    res.msg = 'no found appid!'
  }
  cloud.logger().log({
    data_authorizer
  })
  return res
}

module.exports = {
  getComponentToken,
  getPreAuthUrl,
  confirmAuth,
  getAuthorizerToken,
  getAuthorizerStates
}
