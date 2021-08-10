const tcb = require('@cloudbase/node-sdk')
const api = require('./api.js')
const http = require('../util/http.js')
const appconfig = require('../config/mini.json')
const fs = require('fs')
const path = require('path')

const cloud = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

/**
 * 获取当前访问用户的APPID，包含在鉴权信息中
 */
function getappid () {
  let appid = false
  const userinfo = cloud.auth().getUserInfo()
  if (userinfo.customUserId != null) {
    appid = userinfo.customUserId
  }
  cloud.logger().info({
    ...userinfo
  })
  return appid
}

/**
 * 获取APPID的基本信息（信息设置、部署状态）
 */
async function getInfo () {
  const res = {}
  const appid = getappid()
  if (appid) {
    data_appinfo = (await db.collection('server').doc(appid).get()).data
    if (data_appinfo.length !== 0) {
      res.data = data_appinfo[0]
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    data_appinfo,
    ...res
  })
  return res
}

/**
 * 更新APPID的基本信息（信息设置）
 * @param data
 */
async function saveInfo (data) {
  const res = {}
  const { name, des, img } = data
  if (name != null && des != null && img != null && name != '' && des != '' && img != '') {
    const appid = getappid()
    if (appid) {
      data_appinfo = (await db.collection('server').doc(appid).get()).data
      if (data_appinfo.length !== 0) {
        res.result = await db.collection('server').doc(appid).update({ name, des, img })
        if (data_appinfo[0].appok) {
          res.deploy = await com_deploytcb(1)
          if (res.deploy.msg != null) {
            res.msg = res.deploy.msg
          }
        }
      } else {
        res.result = await db.collection('server').add({ _id: appid, name, des, img, appok: false, messok: false })
      }
    } else {
      res.msg = 'appid no server！'
    }
  } else {
    res.msg = 'data do not empty！'
  }
  cloud.logger().info({
    data_appinfo,
    ...res
  })
  return res
}

/**
 * 开通客服消息
 */
async function openMess () {
  const res = {}
  const appid = getappid()
  if (appid) {
    res.result = await db.collection('server').doc(appid).update({ messok: true })
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    ...res
  })
  return res
}

/**
 * 部署步骤：检查当前应用是否有绑定的云开发环境
 */
async function com_checkState () {
  let api_batchgetenvid_result = null
  const res = {}
  const appid = getappid()
  if (appid) {
    const api_res = await api.getComponentToken()
    if (api_res.access_token != null) {
      api_batchgetenvid_result = await http.api_batchgetenvid(api_res.access_token, [appid])
      if (api_batchgetenvid_result.indexOf('relation_data') !== -1) {
        const { relation_data } = JSON.parse(api_batchgetenvid_result)
        if (relation_data[0].env_list !== 0) {
          res.result = relation_data[0].env_list[0]
        } else {
          res.result = null
        }
        await db.collection('mini').doc(appid).update({
          tcbenv: relation_data[0].env_list
        })
      } else {
        res.msg = 'wxcall batchgetenvid failed！'
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    api_batchgetenvid_result,
    ...res
  })
  return res
}

/**
 * 创建并记录云开发环境
 * @param {*} access_token
 */
async function com_createEnv (access_token) {
  const res = {}
  const api_createenv_result = await http.api_createenv(access_token)
  if (api_createenv_result.indexOf('env') !== -1) {
    const { env, tranid } = JSON.parse(api_createenv_result)
    await db.collection('tcbenv').add({ _id: env, tranid: tranid })
    res.env = env
  } else {
    res.msg = 'wxcall createenv failed！'
  }
  cloud.logger().info({
    api_createenv_result
  })
  return res
}

/**
 * 为应用绑定云开发环境（先找未使用的，最后再新创建）
 */
async function com_shareEnv () {
  let api_batchshareenv_result = null
  let env = null
  const res = {}
  const appid = getappid()
  if (appid) {
    const api_res = await api.getComponentToken()
    if (api_res.access_token != null) {
      const data_authorizer = (await db.collection('mini').doc(appid).get()).data
      if (data_authorizer.length !== 0) {
        const { tcbenv } = data_authorizer[0]
        if (tcbenv == null || tcbenv.length === 0) {
          const data_tcbenv = (await db.collection('tcbenv').where({
            appid: _.exists(false)
          }).get()).data
          if (data_tcbenv.length !== 0) {
            env = data_tcbenv[0]._id
          } else {
            const api_env = await com_createEnv(api_res.access_token)
            if (api_env.env != null) {
              env = api_env.env
            } else {
              res.msg = api_env.msg
            }
          }
          if (env != null) {
            api_batchshareenv_result = await http.api_batchshareenv(api_res.access_token, env, [appid])
            const { errcode, errmsg, err_list } = JSON.parse(api_batchshareenv_result)
            if (errcode === 0) {
              if (err_list.length === 0) {
                await db.collection('tcbenv').doc(env).update({ appid: appid })
                await db.collection('mini').doc(appid).update({ tcbenv: _.push([env]) })
                res.result = 'success'
              } else {
                res.msg = err_list
              }
            } else {
              res.msg = errmsg
            }
          }
        } else {
          res.msg = 'invalid request!'
        }
      } else {
        res.msg = 'no found appid!'
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    api_batchshareenv_result,
    env,
    ...res
  })
  return res
}

/**
 * 部署云开发资源（系列）
 * @param {*} type
 */
async function com_deploytcb (type = 0) {
  const res = {}
  const appid = getappid()
  if (appid) {
    const api_res = await api.getComponentToken()
    if (api_res.access_token != null) {
      const data_authorizer = (await db.collection('mini').doc(appid).get()).data
      if (data_authorizer.length !== 0) {
        const { tcbenv } = data_authorizer[0]
        if (tcbenv != null && tcbenv.length !== 0) {
          res.result = {}
          if (type === 0) {
            const mess_info = (await getInfo()).data
            let updatecode = 0
            if (mess_info.appok === true) updatecode = 1
            res.result.function = await deploy_function(api_res.access_token, tcbenv, updatecode)
            res.result.createdata = await create_database(api_res.access_token, tcbenv[0])
            if (res.result.createdata.error) {
              res.msg = res.result.createdata.error
              return res
            }
          }
          res.result.updatedata = await add_database(api_res.access_token, tcbenv[0])
          if (res.result.updatedata.error) {
            res.msg = res.result.updatedata.error
          }
        } else {
          res.msg = 'invalid request!'
        }
      } else {
        res.msg = 'no found appid!'
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    ...res
  })
  return res
}

/**
 * 部署小程序代码
 */
async function com_deployapp () {
  let api_commit_result = null
  const res = {}
  const appid = getappid()
  if (appid) {
    const api_res = await api.getAuthorizerToken(appid)
    if (api_res.access_token != null) {
      const data_authorizer = (await db.collection('mini').doc(appid).get()).data
      if (data_authorizer.length !== 0) {
        const { tcbenv } = data_authorizer[0]
        if (tcbenv.length !== 0) {
          const ext_json = {
            extEnable: true,
            extAppid: appid,
            directCommit: false,
            ext: {
              resourceAppid: api_res.from_appid,
              resourceEnv: tcbenv[0]
            }
          }
          api_commit_result = await http.api_commit(api_res.access_token, appconfig.vid, JSON.stringify(ext_json), appconfig.version, appconfig.des)
          const { errcode, errmsg } = JSON.parse(api_commit_result)
          if (errcode === 0) {
            await http.api_get_qrcode(api_res.access_token)
            const { fileID } = await cloud.uploadFile({ cloudPath: `code/${appid}.jpg`, fileContent: fs.createReadStream(path.join('/tmp', 'code.jpg')) })
            await db.collection('server').doc(appid).update({ appok: true, appcode: fileID })
            res.result = 'success'
          } else {
            res.msg = errmsg
          }
        } else {
          res.msg = 'invalid request!'
        }
      } else {
        res.msg = 'no found appid!'
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    api_commit_result,
    ...res
  })
  return res
}

/**
 * 部署云开发资源（云函数）
 * @param {*} access_token
 * @param {*} tcbenv
 * @param {*} type
 */
async function deploy_function (access_token, tcbenv, type = 0) {
  const code_lists = ['cloudbase_auth', 'inituser']
  const res = []
  for (const codeitem of code_lists) {
    const base64_code = fs.readFileSync(path.resolve(__dirname, `../code/${codeitem}.zip`), { encoding: 'base64' })
    let api_batchuploadscf_result = null
    if (type === 0) api_batchuploadscf_result = await http.api_batchuploadscf(access_token, codeitem, tcbenv, base64_code)
    else api_batchuploadscf_result = await http.api_batchuploadscfcode(access_token, codeitem, tcbenv, base64_code)
    console.log(`function:${codeitem}---->`, api_batchuploadscf_result)
    const { errcode, errmsg } = JSON.parse(api_batchuploadscf_result)
    if (errcode === 0) {
      res.push({
        name: codeitem,
        result: 'success'
      })
    } else {
      res.push({
        name: codeitem,
        msg: errmsg
      })
    }
  }
  return res
}

/**
 * 部署云开发资源（创建数据库）
 * @param {*} access_token
 * @param {*} env
 */
async function create_database (access_token, env) {
  const db_lists = ['info', 'user']
  const res = []
  const app_info = await getInfo()
  if (app_info.data != null) {
    for (const dbitem of db_lists) {
      const api_dbcollection_result = await http.api_dbcollection(access_token, env, dbitem)
      console.log(`createdb:${dbitem}---->`, api_dbcollection_result)
      const { errcode, errmsg } = JSON.parse(api_dbcollection_result)
      if (errcode === 0) {
        res.push({
          name: dbitem,
          result: 'success'
        })
      } else {
        res.push({
          name: dbitem,
          msg: errmsg
        })
        if (errmsg.indexOf('Table exist') === -1) {
          res.error = `${dbitem}部署出错，${errmsg}`
          return res
        }
      }
    }
  } else {
    res.msg = 'no data'
  }
  return res
}

/**
 * 部署云开发资源（上传LOGO）
 * @param {*} access_token
 * @param {*} env
 * @param {*} img
 */
async function deploy_storage (access_token, env, img) {
  const res = {}
  const pathkey = 'logo.png'
  const api_uploadfile_result = await http.api_uploadfile(access_token, env, pathkey)
  console.log('uploadfile---->', api_uploadfile_result)
  const { errcode, errmsg, url, token, authorization, file_id, cos_file_id } = JSON.parse(api_uploadfile_result)
  if (errcode === 0) {
    const file_buffer = (await cloud.downloadFile({ fileID: img })).fileContent
    const api_uploadcall_result = await http.api_uploadcall(url, pathkey, authorization, token, cos_file_id, file_buffer)
    console.log('uploadcall---->', api_uploadcall_result)
    res.result = file_id
  } else {
    res.msg = errmsg
  }
  return res
}

/**
 * 部署云开发资源（数据库）
 * @param {*} access_token
 * @param {*} env
 */
async function add_database (access_token, env) {
  const res = {}
  const app_info = await getInfo()
  if (app_info.data != null) {
    const deploy_storage_result = await deploy_storage(access_token, env, app_info.data.img)
    if (deploy_storage_result.result != null) {
      const data = {
        _id: 'INFO',
        des: app_info.data.des,
        logo: deploy_storage_result.result,
        title: app_info.data.name
      }
      const api_dbrecord_get = await http.api_dbrecord(access_token, env, 'query', 'db.collection(\'info\').where({_id:\'INFO\'}).get()')
      console.log('dbrecord_get---->', api_dbrecord_get)
      const { errcode, pager } = JSON.parse(api_dbrecord_get)
      if (pager != null && pager.total != null && pager.total === 0) {
        const api_dbrecord_add = await http.api_dbrecord(access_token, env, 'insert', `db.collection('info').add({data:${JSON.stringify(data)}})`)
        console.log('dbrecord_add---->', api_dbrecord_add)
        const { errcode, errmsg } = JSON.parse(api_dbrecord_add)
        if (errcode == 0) {
          res.result = 'success'
        } else {
          res.msg = errmsg
          res.error = errmsg
        }
      } else {
        const api_dbrecord_update = await http.api_dbrecord(access_token, env, 'update', `db.collection('info').doc('INFO').set({data:${JSON.stringify(data)}})`)
        console.log('dbrecord_update---->', api_dbrecord_update)
        const { errcode, errmsg } = JSON.parse(api_dbrecord_update)
        if (errcode === 0) {
          res.result = api_dbrecord_update
        } else {
          res.msg = errmsg
          res.error = errmsg
        }
      }
    } else {
      res.msg = deploy_storage_result.msg
    }
  } else {
    res.msg = 'no data'
  }
  return res
}

/**
 * 获取用户个人信息（从绑定的环境数据库中)
 * @param {*} openid
 */
async function get_userInfo (openid) {
  const res = {}
  let api_dbrecord_get = null
  const appid = getappid()
  if (appid) {
    const api_res = await api.getComponentToken()
    if (api_res.access_token != null) {
      const data_authorizer = (await db.collection('mini').doc(appid).get()).data
      if (data_authorizer.length !== 0) {
        const { tcbenv } = data_authorizer[0]
        if (tcbenv.length !== 0) {
          api_dbrecord_get = await http.api_dbrecord(api_res.access_token, tcbenv[0], 'query', `db.collection("user").where({_id:db.command.in(${JSON.stringify(openid)})}).limit(${openid.length}).get()`)
          const { errcode, errmsg, data } = JSON.parse(api_dbrecord_get)
          if (errcode === 0) {
            res.result = data
          } else {
            res.msg = errmsg
          }
        } else {
          res.msg = 'invalid request!'
        }
      } else {
        res.msg = 'no found appid!'
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    api_dbrecord_get,
    ...res
  })
  return res
}

/**
 * 发送客服消息
 * @param {*} data
 */
async function sendCustomMess (data) {
  let api_custom_send_result = null
  const res = {}
  const { openid, text } = data
  const appid = getappid()
  if (appid) {
    const api_res = await api.getAuthorizerToken(appid)
    if (api_res.access_token != null) {
      api_custom_send_result = await http.api_custom_send(api_res.access_token, openid, text)
      const { errcode, data } = JSON.parse(api_custom_send_result)
      if (errcode === 0) {
        res.result = 'success'
      } else {
        res.msg = errmsg
      }
    } else {
      res.msg = 'component_token is failed!'
    }
  } else {
    res.msg = 'appid no server！'
  }
  cloud.logger().info({
    api_custom_send_result,
    ...res
  })
  return res
}

module.exports = {
  getInfo,
  saveInfo,
  openMess,
  com_checkState,
  com_shareEnv,
  com_deploytcb,
  com_deployapp,
  get_userInfo,
  sendCustomMess
}
