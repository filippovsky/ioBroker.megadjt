/**
 *      ioBroker MegaD-2561 Adapter
 *      11'2016 ausHaus
 *      Lets control the MegaD-2561 over ethernet (http://www.ab-log.ru/smart-house/ethernet/megad-2561)
 *
 *
 *      The device has 36 ports inputs/outputs and DSen, I2C, 1Wire bus.
 *      To read the state of the port call
 *      http://mega_ip/sec/?pt=4&cmd=get , where sec is password (max 3 chars), 4 is port number
 *      The result will come as "ON", "OFF" or analog value for analog ports
 *
 *      To set the state call:
 *      http://mega_ip/sec/?cmd=2:1 , where sec is password (max 3 chars), 2 is port number, and 1 is the value
 *      For digital ports only 0, 1 and 2 (toggle) are allowed, for analog ports the values from 0 to 255 are allowed
 *
 *      The device can report the changes of ports to some web server in form
 *      http://ioBroker:8090/?pt=6  , where 6 is the port number
 *
 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils
//var tools  = require(__dirname + '/lib/tools'); // npm?
var http   = require('http');
var fs     = require('fs');
var process = require('child_process');
var server =  null;
var ports  = {};
///var askInternalTemp = false;
var ask1WireTemp = false;   //1Wire
var connected = false;
var fw_version_actual = "4.18b9";

var adapter = utils.adapter(  'megadjt' );

//            var settings = adapter.config.ports[p];
//adapter.log.info('Create state test ');
//                    adapter.setState( 'fw_version_last_known', {val: fw_version_actual, ack: true});


//-------------------------------------------------------------------------------------------------------------------
adapter.on('stateChange', function (id, state) {
    var matched = [];
    if (id && state && !state.ack) {
        //matched = id.match(/megadjt\.(.*?)\.xp(.*?)/);
        matched = id.match(/xp(.*?)/);
        if ( matched ) {
           adapter.setState( id, {val: state.val, ack: true});           
           adapter.log.info('Изменился исполнительный модуль ' + id + ' на ' + state.val);
           return;
        } 
        if (!ports[id]) {
            adapter.log.error('Unknown port ID ' + id);
            return;
        }
        if (!ports[id].common.write) {
            adapter.log.error('Cannot write the read only port ' + id);
            return;
        }

        adapter.log.info('try to control ' + id + ' with ' + state.val);

        if (state.val === 'false' || state.val === false) state.val = 0;
        if (state.val === 'true'  || state.val === true)  state.val = 1;

        if (parseFloat(state.val) == state.val) {
            // If number => set position
            state.val = parseFloat(state.val);
            if (state.val < 0) {
                adapter.log.warn(': invalid control value ' + state.val + '. Value must be positive');
                state.val = 0;
            }

            if (ports[id].common.type == 'boolean' && state.val !== 0 && state.val != 1) {
                adapter.log.warn(': invalid control value ' + state.val + '. Value for switch must be 0/false or 1/true');
                state.val = state.val ? 1 : 0;
            }

            if (ports[id].common.type == 'boolean') {
		if (id.indexOf('_A') !== -1) {                    // DS2413
                    sendCommandToDSA(ports[id].native.port, state.val);
                } else
                if (id.indexOf('_B') !== -1) {                    // DS2413
                    sendCommandToDSB(ports[id].native.port, state.val);
                } else
                sendCommand(ports[id].native.port, state.val);
            } else if (id.indexOf('_counter') !== -1) {
                sendCommandToCounter(ports[id].native.port, state.val);
            } else {
                ports[id].native.offset = parseFloat(ports[id].native.offset || 0) || 0;
                ports[id].native.factor = parseFloat(ports[id].native.factor || 1) || 1;

                state.val = (state.val - ports[id].native.offset) / ports[id].native.factor;
                state.val = Math.round(state.val);

                sendCommand(ports[id].native.port, state.val);
            }
        }
    }
});

//---------------------------------------------------------------------------------------
adapter.on('ready', function (obj) {
    main();
});

//--------------------------------------------------------------------------------------
adapter.on('message', function (obj) {
    if (obj && obj.command) {
        switch (obj.command) {
            case 'send':
                processMessage(obj.message);
                break;

            case 'discover':
                discoverMega(obj);
                break;

            case 'detectPorts':
                detectPorts(obj);
                break;

            case 'writeConfig':
                writeConfig(obj);
                break;

            case 'updateFirmware':
                updateFirmware(obj.message);
                break;

            case 'getFirmware':
                getFirmwareVersion();
                break;

            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
    processMessages();
});


/*
// Функция получения актуальной версии прошивки Меги ---------------------------------------------------
function getActual2561FirmwareVersion() {
    var version = '';
    //var parts = adapter.config.ip.split(':');
    var actual_version = '';
    var controller_model = '';
    var current_version = '';

    var options = {
        host: 'ab-log.ru',
        port: 80,
        path: '/smart-house/ethernet/megad-2561-firmware'
    };
    if (!options.host) {
       adapter.log.warn('getActual2561FirmwareVersion not executed, because host is null');
    } else {
       adapter.log.debug('getActual2561FirmwareVersion http://' + options.host + options.path);

       http.get(options, function (res) {
          var xmldata = '';
          res.setEncoding('cp1251');//?
          res.on('error', function (e) {
              adapter.log.warn('getActual2561FirmwareVersion error: ' + e);
          });
          res.on('data', function (chunk) {
              xmldata += chunk;
              //adapter.log.debug('getFirmwareVersion get: ' + chunk);
          });
          res.on('end', function () {
              //var myRe = /(.*?)div\sid\=\"cnt\"\>(.*?)\sver\s(.*?)\<(.*?)/
              if (res.statusCode != 200) {
                 adapter.log.warn('getActual2561FirmwareVersion Response code: ' + res.statusCode + ' - ' + xmldata);

              } else {

                 // Вырезаем из данных версию прошивки
                 //adapter.log.debug('getFirmwareVersion response for ' + adapter.config.ip + "[" + options.port + ']: ' + xmldata);
                 //version = xmldata.replace(/(.*?)\sver\s(.*?)\s\-(.*?)/, '$2');
                 adapter.log.debug('xmldata:' + xmldata);
                 //version=xmldata.replace(/(.*?)\sver\s(.*?)\<(.*?)/,'$2');
                 version=xmldata.replace(/(.*?)div\sid\=\"cnt\"\>(.*?)\sver\s(.*?)\<(.*?)/,'$3');
                 adapter.log.debug('Сырое значение актуальной версии:' + version);
                 version = version.replace(/\s/,'');
                 adapter.log.debug('Сырое значение актуальной версии1:' + version);
                 version = version.replace(/eta/,'');
                 adapter.log.debug('Очищенное значение актуальной версии:' + version);

                 if (version) {
                    adapter.setState( 'version.firmware_last_known', {val: version, ack: true});
                    current_version = adapter.getState('version.firmware');

                    if ( version === current_version ) {
                          adapter.setState( 'version.is_firmware_actual', {val: true, ack: true});
                          adapter.log.debug('getFirmwareVersion Текущая версия актуальна');
                    } else {
                          adapter.setState( 'version.is_firmware_actual', {val: false, ack: true});
                          adapter.log.debug('getFirmwareVersion Текущая версия неактуальна');
                    }

                 } else {
                    adapter.log.debug('getActual2561FirmwareVersion НЕ ПОПАЛИ: ' + version);
                 }

              } 

          });
       }).on('error', function (e) {
          adapter.log.warn('Got error by getActual2561FirmwareVersion request ' + e.message);
       });
    }
}
*/


// Функция получения версии прошивки Меги ---------------------------------------------------
function getFirmwareVersion() {
    var version = '';
    var parts = adapter.config.ip.split(':');
    var actual_version = '';
    var controller_model = '';

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password
    };
    if (!options.host) {
       adapter.log.warn('getFirmwareVersion not executed, because host is null');
    } else {
       adapter.log.debug('getFirmwareVersion http://' + options.host + options.path);

       http.get(options, function (res) {
          var xmldata = '';
          res.on('error', function (e) {
              adapter.log.warn('getFirmwareVersion error: ' + e);
          });
          res.on('data', function (chunk) {
              xmldata += chunk;
              //adapter.log.debug('getFirmwareVersion get: ' + chunk);
          });
          res.on('end', function () {
              if (res.statusCode != 200) {
                 adapter.log.warn('getFirmwareVersion Response code: ' + res.statusCode + ' - ' + xmldata);

              } else {

                 // Вырезаем из данных версию прошивки
                 //adapter.log.debug('getFirmwareVersion response for ' + adapter.config.ip + "[" + options.port + ']: ' + xmldata);
                 version = xmldata.replace(/^(.*?)fw\:\s(.*?)\)(.*?)$/, '$2');
                 controller_model = xmldata.replace(/^(.*?)\sby(.*?)$/, '$1');
                 adapter.log.debug('getFirmwareVersion for ' + adapter.config.ip + "[" + options.port + '] parsed as: ' + version);
                 adapter.log.debug('Модель управляющего модуля Меги ' + adapter.config.ip + "[" + options.port + '] распознана как: ' + controller_model);

                 if (version) {
                    adapter.log.debug('getFirmwareVersion сохраняем: ' + version);

                    //adapter.setState( 'version.firmware', {val: version, ack: true});
                    //adapter.log.debug('getFirmwareVersion сохранили: ' + version);

                    adapter.setState( 'fw_version', {val: version, ack: true});
                    adapter.log.debug('getFirmwareVersion сохранили fw_version: ' + version);

                    // Analyse answer and updates staties
                    // if (callback) callback(obj, version);
                    adapter.log.debug('getFirmwareVersion Актуальная версия прошивки: ' + fw_version_actual);
                    //adapter.setState( 'version.firmware_last_known', {val: fw_version_actual, ack: true});
                    adapter.setState( 'fw_version_last_known', {val: fw_version_actual, ack: true});

                    if ( version === fw_version_actual ) {
                          //adapter.setState( 'version.is_firmware_actual', {val: true, ack: true});
                          adapter.setState( 'is_firmware_actual', {val: true, ack: true});
                          adapter.log.debug('getFirmwareVersion Текущая версия актуальна');
                    } else {
                          //adapter.setState( 'version.is_firmware_actual', {val: false, ack: true});
                          adapter.setState( 'is_firmware_actual', {val: false, ack: true});
                          adapter.log.debug('getFirmwareVersion Текущая версия неактуальна');
                    }
                    
                    //adapter.createState( 'xp1');
                    //adapter.createState( 'xp2');

                 } else {
                    adapter.log.debug('getFirmwareVersion НЕ ПОПАЛИ: ' + version);
                 }

                 if (controller_model) {
                    //adapter.setState( 'version.controller_model', {val: controller_model, ack: true});
                    adapter.setState( 'controller_model', {val: controller_model, ack: true});
                 } else {
                    adapter.log.debug('Не смогли определить модель управляющего контроллера Меги');
                 }


              } 

          });
       }).on('error', function (e) {
          adapter.log.warn('Got error by getFirmwareVersion request ' + e.message);
       });
    }
}


// Функция перепрошивки Меги ---------------------------------------------------------------
function updateFirmware( message ) {
   var parts = adapter.config.ip.split(':');
   var ip = parts[0];
   var pass = adapter.config.password;
   var cmd = '';
   var cmd1 = '';
   var targetVersion = '';

   if (typeof message === 'string') {
       try {
            message = JSON.parse(message);
       } catch (err) {
            adapter.log.error('Cannot parse: ' + message);
            return;
       }
   }


   if (message.targetVersion) {
      adapter.log.debug('Получен желаемый номер версии прошивки '+message.targetVersion);
      targetVersion = message.targetVersion || fw_version_actual;
   } else {
      adapter.log.debug('Не получен желаемый номер версии прошивки');
      targetVersion = fw_version_actual;
   }

   var dir ='';
   adapter.log.info('Вызвана функция перепрошивки Меги ip=' + ip +' до версии '+targetVersion);
   if ( !ip ) {
      adapter.log.warn('Не передан IP-адрес Меги. Перепрошивка отменена.');
      return;
   }
   if ( !pass ) {
      adapter.log.warn('Не передан пароль Меги. Перепрошивка отменена.');
      return;
   }
   dir = adapter.adapterDir;
   if ( !dir ) {
      adapter.log.warn('Не удалось определить каталог адаптера. Перепрошивка отменена.');
      return;
   }
   dir = dir + '/firmware';

   if (targetVersion === 'bootloader') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --fw '+fw_version_actual+'.hex -f -e';
   } else {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --fw '+targetVersion+'.hex -p '+pass+' --ee --ip '+ip;
   }
   cmd1 = 'php ./megad-cfg-2561.php  --ip 192.168.0.14 --new-ip '+ip+' -p sec';

   adapter.log.debug(cmd);
   
   var p=process.exec( cmd, 
          { cwd: dir  },
       function (error, stdout, stderr) {
        if (error) {
           adapter.log.error( error.code );
           adapter.log.error( error );
        }
        if ( stdout ) {
           adapter.log.info( stdout );
        }
        if ( stderr ) {
           adapter.log.error( stderr );
        }
        adapter.log.debug('Выполнили прошивку');
        if (targetVersion != 'bootloader') {
           adapter.log.debug('меняем ip-адрес Меги');
           adapter.log.debug(cmd1);

           var p1=process.exec( cmd1, 
                                { cwd: dir },
                                function (error, stdout, stderr) {
                                   if (error) {
                                      adapter.log.error( error.code );
                                      adapter.log.error( error );
                                   }
                                   if ( stdout ) {
                                      adapter.log.info( stdout );
                                   }
                                   if ( stderr ) {
                                      adapter.log.error( stderr );
                                   }
                                   adapter.log.debug('Выполнили прошивку');
                                   getFirmwareVersion();
                               });
        } else {
          getFirmwareVersion();
        }
   });
}


// Функция считывания настроек Меги в файл ---------------------------------------------------------------
function readMegaConfig2File( filename ) {
   //return;
   var parts = adapter.config.ip.split(':');
   var ip = parts[0];
   var pass = adapter.config.password;
   var cmd = '';
   var filename1 = filename || 'last.cfg';
   var uplevel = '../../';
   
   var dir ='';
   adapter.log.info('Считываем настройки Меги ip=' + ip );
   if ( !ip ) {
      adapter.log.warn('Не передан IP-адрес Меги. Считывание настроек отменено.');
      return;
   }
   if ( !pass ) {
      adapter.log.warn('Не передан пароль Меги. Считывание настроек отменено.');
      return;
   }
   dir = adapter.adapterDir;
   if ( !dir ) {
      adapter.log.warn('Не удалось определить каталог адаптера. Перепрошивка отменена.');
      return;
   }
   dir = dir + '/firmware';
   //var dir1 = '../../files/iobroker.megadjt' ;

//   cmd = 'mkdir '+dir+'/'+dir1+'|chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --ip '+ip+' --read-conf '+dir1+'/'+filename1+' -p '+pass;
   cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --ip '+ip+' --read-conf '+filename1+' -p '+pass;

   adapter.log.debug(cmd);
   
   var p=process.exec( cmd, 
          { cwd: dir  },
       function (error, stdout, stderr) {
        if (error) {
           adapter.log.error( error.code );
           adapter.log.error( error );
        }
        if ( stdout ) {
           adapter.log.info( stdout );
        }
        if ( stderr ) {
           adapter.log.error( stderr );
        }
        adapter.log.info('Настройки Меги считаны в файл '+filename1);
/*
//        var cmd1 = 'cd '+dir+'|cd '+uplevel+'|cd etc|mkdir iobroker.megadjt|cd '+dir+'|cp --remove-destination ./'+filename1+' '+uplevel+'etc/iobroker.megadjt/'+filename1;
        var cmd1 = 'mkdir -p '+uplevel+'etc/iobroker.megadjt|cp --remove-destination ./'+filename1+' '+uplevel+'etc/iobroker.megadjt/'+filename1;
        adapter.log.debug(cmd1);
        var p1=process.exec( cmd1, 
                             { cwd: dir  },
                             function (error, stdout, stderr) {
                                if (error) {
                                   adapter.log.error( error.code );
                                   adapter.log.error( error );
                                }
                                if ( stdout ) {
                                   adapter.log.info( stdout );
                                }
                                if ( stderr ) {
                                   adapter.log.error( stderr );
                                }
                                adapter.log.info('Файл с настройками Меги перенесен в папку iobroker: etc/iobroker.megadjt/'+filename1);
                             });*/
   });
}


//------------------------------------------------------------------------------------------------------
function processMessages(ignore) {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            if (!ignore && obj && obj.command == 'send') processMessage(obj.message);
            processMessages();
        }
    });
}


//-------------------------------------------------------------------------------------------------------------------------
// Because the only one port is occupied by first instance, the changes to other devices will be send with messages
function processMessage(message) {
    var port;
    if (typeof message === 'string') {
        try {
            message = JSON.parse(message);
        } catch (err) {
            adapter.log.error('Cannot parse: ' + message);
            return;
        }
    }
    port = message.pt;

    // Command from instance with web server
    if (adapter.config.ports[port]) {
        // If digital port
        if (!adapter.config.ports[port].pty && adapter.config.ports[port].m != 1) {
            adapter.config.ports[port].value = !adapter.config.ports[port].m ? 1 : 0;
            processClick(port);
        } else if (adapter.config.ports[port].pty == 3 && adapter.config.ports[port].d == 4) {
            // process iButton
            adapter.setState(adapter.config.ports[port].id, message.val, true);
        } else {
            adapter.log.debug('reported new value for port ' + port + ', request actual value');
            // Get value from analog port
            getPortState(port, processPortState);
        }
    }
}


//----------------------------------------------------------------------------------------------------------------------
function writeConfigOne(ip, pass, _settings, callback, port, errors) {
    if (port === undefined) {
        port = 0;
        errors = [];
    } else {
        port++;
    }
    var settings = _settings[port];
    if (!settings) {
        return callback(errors);
    }

    var parts = ip.split(':');
    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + pass + '/?pn=' + port
    };

    //http://192.168.0.14/sec/?pn=1&pty=0...
    if (settings.ecmd === 'ð=') settings.ecmd = '';

    settings.pty = parseInt(settings.pty, 10) || 0;

    // Input
    if (!settings.pty) {
        settings.d    = parseInt(settings.d, 10) || 0;
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        ///options.path += '&pty=0&m=' + (settings.m || 0) + '&misc=1&d=' + settings.d + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
        options.path += '&pty=0&m=' + (settings.m || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
        if (settings.af == 1) {
            options.path += '&af=1';
        }
        if (settings.naf == 1) {
            options.path += '&naf=1';
        }
        if (settings.misc == 1) {
            options.path += '&misc=1';
        }
        if (settings.d == 1) {
            options.path += '&d=' + settings.d;
        }
    } else
    if (settings.pty == 1) {
        ///settings.pwm = parseInt(settings.pwm, 10) || 0;
        ///if (settings.pwm > 255) settings.pwm = 255;
        ///if (settings.pwm < 0)   settings.pwm = 0;
	settings.d = parseInt(settings.d, 10) || 0;
        if (settings.d > 255) settings.d = 255;
        if (settings.d < 0)   settings.d = 0;

        // digital out
        ///options.path += '&pty=1&m=' + (settings.m || 0) + '&d=' + (settings.d || 0) + '&pwm=' + (settings.pwm || 0);
	options.path += '&pty=1&m=' + (settings.m || 0) + '&d=' + (settings.d || 0);
        if (settings.m == 1 && settings.misc == 1) {
            options.path += '&misc=1' + '&m2=' + (settings.m2 || 0);
        }
    } else
    if (settings.pty == 2) {
        // Convert misc with given factor and offset
        settings.factor = parseFloat(settings.factor || 1) || 1;
        settings.offset = parseFloat(settings.offset || 0) || 0;
        settings.misc = Math.round(((parseFloat(settings.misc) || 0) - settings.offset) / settings.factor);

        if (settings.misc > 1023) settings.misc = 1023;
        if (settings.misc < 0)    settings.misc = 0;

        // ADC
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        ///options.path += (((port == 14 || port == 15) && settings.pty == 2) ? '' : '&pty=2') + '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
        options.path += '&pty=2' + '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&hst=' + (settings.hst || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
        if (settings.naf == 1) {
            options.path += '&naf=1';
        }
    } else
    if (settings.pty == 3) {
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        // digital sensor
        options.path += '&pty=3&d=' + (settings.d || 0);
	if (settings.d == 3) {
            ///options.path += '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
            options.path += '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&hst=' + (settings.hst || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
            if (settings.naf == 1) {
                options.path += '&naf=1';
            }
        }
    /*} else
    if (settings.pty == 4) {
        adapter.log.info('Do not configure internal temperature port ' + port);
        return writeConfigOne(ip, pass, _settings, callback, port, errors);*/
    } else {
        // NC
        options.path += '&pty=255';
    }

    // If internal temperature
    ///adapter.log.info('Write config for port ' + port + ': http://' + ip + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                adapter.log.debug('Response: ' + data);
            }

            if (res.statusCode != 200) errors[port] = res.statusCode;

            setTimeout(function () {
                writeConfigOne(ip, pass, _settings, callback, port, errors);
            }, 1000);
        });
    }).on('error', function (err) {
        errors[port] = err;
        setTimeout(function () {
            writeConfigOne(ip, pass, _settings, callback, port, errors);
        }, 1000);
    });
}


//---------------------------------------------------------------------------------------------
function ipToBuffer(ip, buff, offset) {
    offset = ~~offset;

    var result;

    if (/^(\d{1,3}\.){3,3}\d{1,3}$/.test(ip)) {
        result = buff || new Buffer(offset + 4);
        ip.split(/\./g).map(function (byte) {
            result[offset++] = parseInt(byte, 10) & 0xff;
        });
    } else if (/^[a-f0-9:]+$/.test(ip)) {
        var s    = ip.split(/::/g, 2);
        var head = (s[0] || '').split(/:/g, 8);
        var tail = (s[1] || '').split(/:/g, 8);

        if (tail.length === 0) {
            // xxxx::
            while (head.length < 8) {
                head.push('0000');
            }
        } else if (head.length === 0) {
            // ::xxxx
            while (tail.length < 8) {
                tail.unshift('0000');
            }
        } else {
            // xxxx::xxxx
            while (head.length + tail.length < 8) {
                head.push('0000');
            }
        }

        result = buff || new Buffer(offset + 16);
        head.concat(tail).map(function (word) {
            word = parseInt(word, 16);
            result[offset++] = (word >> 8) & 0xff;
            result[offset++] = word & 0xff;
        });
    } else {
        throw Error('Invalid ip address: ' + ip);
    }

    return result;
}


//----------------------------------------------------------------------------------------------------------------
function ipToString(buff, offset, length) {
    var i;
    offset = ~~offset;
    length = length || (buff.length - offset);

    var result = [];
    if (length === 4) {
        // IPv4
        for (i = 0; i < length; i++) {
            result.push(buff[offset + i]);
        }
        result = result.join('.');
    } else if (length === 16) {
        // IPv6
        for (i = 0; i < length; i += 2) {
            result.push(buff.readUInt16BE(offset + i).toString(16));
        }
        result = result.join(':');
        result = result.replace(/(^|:)0(:0)*:0(:|$)/, '$1::$3');
        result = result.replace(/:{3,4}/, '::');
    }

    return result;
}

//-------------------------------------------------------------------------------------------------------------------
function ipMask(addr, mask) {
    var i;
    addr = ipToBuffer(addr);
    mask = ipToBuffer(mask);

    var result = new Buffer(Math.max(addr.length, mask.length));

    // Same protocol - do bitwise and
    if (addr.length === mask.length) {
        for (i = 0; i < addr.length; i++) {
            result[i] = addr[i] & mask[i];
        }
    } else if (mask.length === 4) {
        // IPv6 address and IPv4 mask
        // (Mask low bits)
        for (i = 0; i < mask.length; i++) {
            result[i] = addr[addr.length - 4  + i] & mask[i];
        }
    } else {
        // IPv6 mask and IPv4 addr
        for (i = 0; i < result.length - 6; i++) {
            result[i] = 0;
        }

        // ::ffff:ipv4
        result[10] = 0xff;
        result[11] = 0xff;
        for (i = 0; i < addr.length; i++) {
            result[i + 12] = addr[i] & mask[i + 12];
        }
    }

    return ipToString(result);
}

//-------------------------------------------------------------------------------------------------------------------
function findIp(ip) {
    var parts = ip.split(':');
    ip = parts[0];

    if (ip === 'localhost' || ip == '127.0.0.1') return '127.0.0.1';

    var interfaces = require('os').networkInterfaces();

    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal && address.address) {

                // Detect default subnet mask
                var num = parseInt(address.address.split('.')[0], 10);
                var netMask;
                if (num >= 192) {
                    netMask = '255.255.255.0';
                } else
                if (num >= 128) {
                    netMask = '255.255.0.0';
                } else {
                    netMask = '255.0.0.0';
                }

                if (ipMask(address.address, netMask) == ipMask(ip, netMask)) {
                    return address.address;
                }
            }
        }
    }
    return null;
}

//--------------------------------------------------------------------------------------------------------
function writeConfigDevice(ip, pass, config, callback) {
    //pwd: пароль для доступа к Web-интерфейсу устройства (макс. 3 байт)
    //eip: IP-адрес устройства
    //sip: IP-адрес сервера
    //sct: скрипт, который вызывается на сервере в случаях, заданных пользователем (макс. 15 байт)

    //pr: Пресет. Значения: 0 - пресет не установлен, 1 - пресет для исполнительного модуля MegaD-7I7O
    //tc: Проверка значений встроенного температурного сенсора. Значения: 0 - не проверять, 1 - проверять
    //at: Значение температуры, при достижении которого в случае, если задана проверка встроенного температурного датчика, устройство будет отправлять сообщения на сервер
    var parts = ip.split(':');
    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + pass + '/?cf=1'
    };

    if (config.eip !== undefined && config.eip != ip)   options.path += '&eip=' + config.eip;
    if (config.pwd !== undefined && config.pwd != pass) options.path += '&pwd=' + config.pwd;

    if (config.eip === undefined && config.pwd === undefined) {
        var sip = findIp(config.eip || ip);
        if (!sip) {
            return callback('Device with "' + ip + '" is not reachable from ioBroker.');
        }
        options.path += '&sip=' + sip + (config.port ? ':' + config.port : '');
        options.path += '&sct=' + encodeURIComponent(adapter.instance + '/');
    }

    adapter.log.info('Write config for device: http://' + ip + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                adapter.log.debug('Response: ' + data);
            }
            callback(null);
        });
    }).on('error', function (err) {
        callback(err.message);
    });
}

//-----------------------------------------------------------------------------------------------------------------
function writeConfig(obj) {
    var ip;
    var password;
    var _ports;
    var config;
    if (obj && obj.message && typeof obj.message == 'object') {
        ip       = obj.message.ip;
        password = obj.message.password;
        _ports   = obj.message.ports;
        config   = obj.message.config;
    } else {
        ip       = obj ? obj.message : '';
        password = adapter.config.password;
        _ports   = adapter.config.ports;
        config   = adapter.config;
    }

    var errors = [];
    if (ip && ip != '0.0.0.0') {
        var running = false;
        if (_ports && _ports.length) {
            running = true;
            writeConfigOne(ip, password, _ports, function (err, port) {
                setTimeout(function () {
                    if (err) errors[port] = err;
                    if (config) {
                        writeConfigDevice(ip, password, config, function (err) {
                            if (err) errors[20] = err;
                            if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
                        });
                    } else {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
                    }
                }, 1000);
            });
        } else if (config) {
            running = true;
            writeConfigDevice(ip, password, config, function (err) {
                if (err) errors[20] = err;
                if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
            });
        }

        if (!running) {
            if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'no ports and no config'}, obj.callback);
        }
    } else {
        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'invalid address'}, obj.callback);
    }
}

//------------------------------------------------------------------------------------------------------------
function detectPortConfig(ip, pass, length, callback, port, result) {
    if (port === undefined) {
        port = 0;
        result = [];
    } else {
        port++;
        if (port >= length) {
            return callback(result);
        }
    }

    var parts = ip.split(':');
    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + pass + '/?pt=' + port
    };

    adapter.log.info('read config from port: http://' + ip + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                var settings = {};
                // Analyse answer
                var inputs = data.match(/<input [^>]+>/g);
                var i;

                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var args = inputs[i].match(/(\w+)=([^<> ]+)/g);
                        if (args) {
                            var isettings = {};
                            for (var a = 0; a < args.length; a++) {
                                var parts = args[a].split('=');
                                isettings[parts[0]] = parts[1].replace(/^"/, '').replace(/"$/, '');
                            }

                            if (isettings.name) {
                                settings[isettings.name] = (isettings.value === undefined) ? '' : isettings.value;
                                if (isettings.type == 'checkbox' && inputs[i].indexOf('checked') == -1) {
                                    settings[isettings.name] = (!settings[isettings.name]) ? 1 : 0;
                                }
                            }
                        }
                    }
                }
                inputs = data.match(/<select .+?<\/select>/g);
                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var name = inputs[i].match(/name=(\w+)/);
                        if (name) {
                            var vars = inputs[i].match(/<option value=(\d+) selected>/);
                            if (vars) {
                                settings[name[1]] = vars[1];
                            } else {
                                settings[name[1]] = 0;
                            }
                        }
                    }
                }

                if (settings.pty === undefined) {
                    if (data.indexOf('>Type In<') != -1) {
                        settings.pty = 0;
                    } else if (data.indexOf('>Type Out<') != -1) {
                        settings.pty = 1;
                    ///} else if (data.match(/<br>A\d+\//)) {
                        ///settings.pty = 2;
                    }
                } else {
                    settings.pty = parseInt(settings.pty, 10);
                }

                /*if (settings.pty == 1) {
                    settings.m   = settings.m   || 0;
                    settings.pwm = settings.pwm || 0;
                }*/
                if (settings.m    !== undefined) settings.m    = parseInt(settings.m,    10);
                if (settings.d    !== undefined) settings.d    = parseInt(settings.d,    10);
                ///if (settings.misc !== undefined) settings.misc = parseInt(settings.misc, 10);
                ///if (settings.pwm  !== undefined) settings.pwm  = parseInt(settings.pwm,  10);
                if (settings.pn   !== undefined) settings.pn   = parseInt(settings.pn,   10);
                if (settings.naf  !== undefined) settings.naf  = parseInt(settings.naf,  10);
		if (settings.fr   !== undefined) settings.fr   = parseInt(settings.fr,   10);
                if (settings.m2   !== undefined) settings.m2   = parseInt(settings.m2,   10);
                if (settings.ecmd === 'ð=')      settings.ecmd = '';

                result[port] = settings;
                adapter.log.debug('Response: ' + data);
            }
            detectPortConfig(ip, pass, length, callback, port, result);
        });
    }).on('error', function (err) {
        adapter.log.error(err.message);
        detectPortConfig(ip, pass, length, callback, port, result);
    });
}


// Получение конфигурации Меги из устройства -------------------------------------------------------------------------
function detectDeviceConfig(ip, pass, callback) {
    var parts = ip.split(':');
    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + pass + '/?cf=1'
    };

    adapter.log.info('read config from port: http://' + ip + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                // parse config
                // Analyse answer
                var inputs = data.match(/<input [^>]+>/g);
                var i;
                var settings = {};

                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var args = inputs[i].match(/(\w+)=([^<> ]+)/g);
                        if (args) {
                            var isettings = {};
                            for (var a = 0; a < args.length; a++) {
                                var parts = args[a].split('=');
                                isettings[parts[0]] = parts[1].replace(/^"/, '').replace(/"$/, '');
                            }

                            if (isettings.name) {
                                settings[isettings.name] = (isettings.value === undefined) ? '' : isettings.value;
                                if (isettings.type == 'checkbox' && inputs[i].indexOf('checked') == -1) {
                                    settings[isettings.name] = (!settings[isettings.name]) ? 1 : 0;
                                }
                            }
                        }
                    }
                }
                inputs = data.match(/<select .+?<\/select>/g);
                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var name = inputs[i].match(/name=(\w+)/);
                        if (name) {
                            var vars = inputs[i].match(/<option value=(\d+) selected>/);
                            if (vars) {
                                settings[name[1]] = vars[1];
                            } else {
                                settings[name[1]] = 0;
                            }
                        }
                    }
                }
                callback(null, settings);
            }
        });
    }).on('error', function (err) {
        adapter.log.error(err.message);
        callback(err);
    });
    //-------------------------------------------------------
    readMegaConfig2File( 'last.cfg' );

}


//------------------------------------------------------------------------------------------------------------------
// Message is IP address
function detectPorts(obj) {
    var ip;
    var password;
    if (obj && obj.message && typeof obj.message == 'object') {
        ip       = obj.message.ip;
        password = obj.message.password;
    } else {
        ip       = obj ? obj.message : '';
        password = adapter.config.password;
    }
    if (ip && ip != '0.0.0.0') {
        getPortsState(ip, password, function (err, response) {
            if (err || !response) {
                if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: err, response: response}, obj.callback);
                return;
            }
            var parts  = response.split(';');
            detectPortConfig(ip, password, parts.length, function (result) {
                detectDeviceConfig(ip, password, function (error, devConfig) {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: err, response: response, ports: result, config: devConfig}, obj.callback);
                });
            });
        });
    } else {
        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'invalid address'}, obj.callback);
    }
}


//---------------------------------------------------------------------------------------------------------------
function discoverMegaOnIP(ip, callback) {
    var nums = ip.split('.');
    nums[3] = 255;
    ip = nums.join('.');

    var dgram = require('dgram');
    var message = new Buffer([0xAA, 0, 12]);
    var client = dgram.createSocket('udp4');
    client.on('error', function (err) {
        adapter.log.error(err);
    });

    client.bind(42000, function () {
        client.setBroadcast(true);
    });

    client.on('message', function (msg, rinfo) {
        if (msg[0] == 0xAA) {
            result.push(rinfo.address);
        }

        console.log('Received %d bytes from %s:%d\n',
            msg.length, rinfo.address, rinfo.port);
    });
    client.send(message, 0, message.length, 52000, ip, function (err) {
        console.log('Discover sent to ' + ip);
    });
    var result = [];

    setTimeout(function () {
        client.close();
        callback(result);
    }, 2000);

}

//--------------------------------------------------------------------------------------------------
function discoverMega(obj) {
    var interfaces = require('os').networkInterfaces();
    var result = [];
    var count  = 0;
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal && address.address) {
                count++;
                discoverMegaOnIP(address.address, function (_result) {
                    if (_result && _result.length) {
                        for (var i = 0; i < _result.length; i++) {
                            result.push(_result[i]);
                        }
                    }
                    if (!--count) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: null, devices: result}, obj.callback);
                    }
                });
            }
        }
    }

    if (!count && obj.callback) adapter.sendTo(obj.from, obj.command, {error: null, devices: []}, obj.callback);
}

//--------------------------------------------------------------------------------------------------------------------
// Get State of ONE port
function getPortState(port, callback) {
    var parts = adapter.config.ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password + '/?pt=' + port + '&cmd=get'
    };
    adapter.log.debug('getPortState http://' + options.host + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
            adapter.log.warn('megaD: ' + e);
        });
        res.on('data', function (chunk) {

            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
            }
            adapter.log.debug('response for ' + adapter.config.ip + "[" + port + ']: ' + xmldata);
            // Analyse answer and updates staties
            if (callback) callback(port, xmldata);
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request ' + e.message);
    });
}

//------------------------------------------------------------------------------------------------------------
function getPortStateW(ip, password, port, callback) {                  // 1Wire
    //http://192.168.1.14/sec/?pt=33&cmd=list
    if (typeof ip == 'function') {
        callback = ip;
        ip = null;
    }
    if (typeof password == 'function') {
        callback = password;
        password = null;
    }
    password = (password === undefined || password === null) ? adapter.config.password : password;
    ip       =  ip || adapter.config.ip;
    
    var parts = ip.split(':');

    var options = {
	host: parts[0],
        port: parts[1] || 80,
        path: '/' + password + '/?pt=' + port + '&cmd=list'
    };

    adapter.log.debug('getPortStateW http://' + options.host + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
	    adapter.log.warn(e);
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
                //if (callback) callback(xmldata);
            } else {
                adapter.log.debug('Response for ' + ip + "[" + port + ']: ' + xmldata);
                // Analyse answer and updates statuses
		//if (callback) callback(null, xmldata);
                if (callback) callback(port, xmldata);
            }

        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request to ' + ip + ': ' + e.message);
        callback(e.message);
    });
}    

//---------------------------------------------------------------------------------------------------------
// Get state of ALL ports
function getPortsState(ip, password, callback) {
    if (typeof ip == 'function') {
        callback = ip;
        ip = null;
    }
    if (typeof password == 'function') {
        callback = password;
        password = null;
    }
    password = (password === undefined || password === null) ? adapter.config.password : password;
    ip       =  ip || adapter.config.ip;

    var parts = ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + password + '/?cmd=all'
    };

    adapter.log.debug('getPortState http://' + options.host + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
            adapter.log.warn(e);
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
                if (callback) callback(xmldata);
            } else {
                adapter.log.debug('Response for ' + ip + '[all]: ' + xmldata);
                // Analyse answer and updates statuses
                if (callback) callback(null, xmldata);
            }

        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request to ' + ip + ': ' + e.message);
        callback(e.message);
    });
}

/*function getInternalTemp(ip, password, callback) {
    //http://192.168.0.14/sec/?tget=1
    if (typeof ip == 'function') {
        callback = ip;
        ip = null;
    }
    if (typeof password == 'function') {
        callback = password;
        password = null;
    }
    password = (password === undefined || password === null) ? adapter.config.password : password;
    ip       =  ip || adapter.config.ip;

    var parts = ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + password + '/?tget=1'
    };

    adapter.log.debug('getInternalTemp http://' + options.host + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
            adapter.log.warn(e);
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
                if (callback) callback(xmldata);
            } else {
                adapter.log.debug('Response for ' + ip + '[tget]: ' + xmldata);
                // Analyse answer and updates statuses
                if (callback) callback(null, xmldata);
            }

        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request to ' + ip + ': ' + e.message);
        callback(e.message);
    });
}*/

//------------------------------------------------------------------------------------------------------------------
function processClick(port) {
    var config = adapter.config.ports[port];

    // If press_long
    ///if (config.m == 1 && config.long) {
    if ((config.m == 1 || config.misc == 1) && config.long) {	
        // Detect EDGE
        if (config.oldValue !== undefined && config.oldValue !== null && config.oldValue != config.value) {
            adapter.log.debug('new state detected on port [' + port + ']: ' + config.value);

            // If pressed
            if (config.value) {
                // If no timer running
                if (!config.longTimer) {
                    adapter.log.debug('start long click detection on [' + port + ']: ' + config.value);
                    // Try to detect long click
                    config.longTimer = setTimeout(function () {
                        config.longTimer = null;
                        config.longDone  = true;

                        adapter.log.debug('Generate LONG press on port ' + port);

                        adapter.setState(config.id + '_long', true, true);

                    }, adapter.config.longPress);
                } else {
                    adapter.log.warn('long timer runs, but state change happens on [' + port + ']: ' + config.value);
                }
            } else {
                // If released
                // If timer for double running => stop it
                if (config.longTimer) {
                    adapter.log.debug('stop long click detection on [' + port + ']: ' + config.value);
                    clearTimeout(config.longTimer);
                    config.longTimer = null;
                }

                // If long click generated => clear flag and do nothing, elsewise generate normal click
                if (!config.longDone) {
                    adapter.log.debug('detected short click on port [' + port + ']: ' + config.value);

                    if (config.double && adapter.config.doublePress) {
                        detectDoubleClick(port);
                    } else {
                        adapter.setState(config.id, true, true);
                        // Set automatically the state of the port to false after 100ms
                        setTimeout(function () {
                            adapter.setState(config.id, false, true);
                        }, 100);
                    }
                } else {
                    // Set to false
                    adapter.log.debug('Remove LONG press on port ' + port);
                    adapter.setState(config.id + '_long', false, true);

                    adapter.log.debug('clear the double click flag on port [' + port + ']: ' + config.value);
                    config.longDone = false;
                }
            }
        } else {
            adapter.log.debug('ignore state on port [' + port + ']: ' + config.value + ' (because the same)');
        }
    } else {
        adapter.log.debug('detected new state on port [' + port + ']: ' + config.value);
        triggerShortPress(port);
    }
}

//-------------------------------------------------------------------------------------------------------------------
function detectDoubleClick(port) {
    var config = adapter.config.ports[port];

    if (config.double && adapter.config.doublePress) {

        if (config.doubleTimer) {
            clearTimeout(config.doubleTimer);
            config.doubleTimer = null;
            adapter.log.debug('Generate double click on port ' + port);
            // Generate double click
            adapter.setState(config.id + '_double', true, true);

            // Set automatically the state of the port to false after 100ms
            setTimeout(function () {
                adapter.setState(config.id + '_double', false, true);
            }, 100);

        } else {

            adapter.log.debug('Start timer for ' + adapter.config.doublePress + 'ms to detect double click on ' + port);

            config.doubleTimer = setTimeout(function () {
                adapter.log.debug('Generate short click on port ' + port);
                // Generate single click
                config.doubleTimer = null;
                adapter.setState(config.id, true, true);
                // Set automatically the state of the port to false after 100ms
                setTimeout(function () {
                    adapter.setState(config.id, false, true);
                }, 100);
            }, adapter.config.doublePress);

        }
    }
}

//-------------------------------------------------------------------------------------------------------------
function triggerShortPress(port) {
    var config = adapter.config.ports[port];

    if (config.double && adapter.config.doublePress) {
        // if not first read
        if (config.oldValue === undefined || config.oldValue === null) return;

        if (!config.value) {
            adapter.setState(config.id, false, true);
             return;
        }

        detectDoubleClick(port);
    } else {
        ///if (config.m != 1) {
	if (config.misc != 1) {
            // if not first read
            if (config.oldValue === undefined || config.oldValue === null) return;
            adapter.log.debug('reported new state for port ' + port + ' - true');

            adapter.setState(config.id, true, true);

            // Set automatically the state of the port to false after 100ms
            setTimeout(function () {
                adapter.log.debug('set state for port ' + port + ' back to false');
                config.value = 0;
                adapter.setState(config.id, false, true);
            }, 100);
        } else {
            adapter.setState(config.id, !!config.value, true);
        }
    }
}

//------------------------------------------------------------------------------------------------------------------
function processPortState(_port, value) {
    var _ports = adapter.config.ports;
    var q = 0;

	if (!_ports[_port]) {
		// No configuration found
		adapter.log.warn('Unknown port: ' + _port);
		return;
	}
	
    if (value !== null) {
        var secondary = null;
        var f;
        // Value can be OFF/5 or 27/0 or 27 or ON  or DS2413 ON/OFF 
        if (typeof value == 'string') {
            var t = value.split('/');
            var m = value.match(/temp:([0-9.-]+)/);
            if (m) {
                secondary = value.match(/hum:([0-9.]+)/);
                if (secondary) secondary = parseFloat(secondary[1]);
                value = m[1];
            } else {
                value = t[0];
            }

            if (t[1] !== undefined && secondary === null) { // counter
                secondary = parseInt(t[1], 10);
            }
	    if (t[1] == 'OFF') {  // DS2413
                secondary = 0;
            } else
            if (t[1] == 'ON') {
                secondary = 1;
            } else if (t[1] == 'NA') {
                secondary = 0;
                q = 0x82; // DS2413 not connected
            }

            if (value == 'OFF') {
                value = 0;
            } else
            if (value == 'ON') {
                value = 1;
            } else if (value == 'NA') {
                value = 0;
                q = 0x82; // sensor not connected
            } else {
                value = parseFloat(value) || 0;
            }
        }

        // If status changed
        if (value !== _ports[_port].value || _ports[_port].q != q || (secondary !== null && _ports[_port].secondary != secondary)) {
            _ports[_port].oldValue = _ports[_port].value;

            ///if (!_ports[_port].pty) {
	    if (_ports[_port].pty == 0) {
                if (value !== _ports[_port].value || _ports[_port].q != q) {
                    _ports[_port].value = value;
                    processClick(_port);
                }
                if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                    adapter.setState(_ports[_port].id + '_counter', {val: secondary, ack: true, q: q});
                }
            } else
            if (_ports[_port].pty == 2) {
                f = value * _ports[_port].factor + _ports[_port].offset;
                value = Math.round(value * 1000) / 1000;

                adapter.log.debug('detected new value on port [' + _port + ']: ' + value + ', calc state ' + f);
                adapter.setState(_ports[_port].id, {val: f, ack: true, q: q});
            } else
            if (_ports[_port].pty == 3) {
                if (_ports[_port].value != value || _ports[_port].q != q) {
                    adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});
                }
                if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                    adapter.setState(_ports[_port].id + '_humidity', {val: secondary, ack: true, q: q});
                }
            } else
            if (_ports[_port].pty == 4) { //NEW
                if (_ports[_port].value != value || _ports[_port].q != q) {
                    adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});
                }
                if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                    adapter.setState(_ports[_port].id + '_humidity', {val: secondary, ack: true, q: q});
                }
            } else
            if (_ports[_port].pty == 1) {
                ///if (_ports[_port].m) {
		if (_ports[_port].m == 1) {
                    //f = value * _ports[_port].factor + _ports[_port].offset;
                    value = Math.round(value * 1000) / 1000;

                    adapter.log.debug('detected new value on port [' + _port + ']: ' + value);
                    adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});
		}
		if (_ports[_port].m == 0) {
                ///} else {
                    adapter.log.debug('detected new value on port [' + _port + ']: ' + (value ? true : false));
                    adapter.setState(_ports[_port].id, {val: value ? true : false, ack: true, q: q});
                }
		if (_ports[_port].m == 2) {  // DS2413
		    if (value !== _ports[_port].value || _ports[_port].q != q) {
                        adapter.log.debug('detected new value on port [' + _port + '_A' + ']: ' + (value ? true : false));
                        adapter.setState(_ports[_port].id + '_A', {val: value ? true : false, ack: true, q: q});
		    }
                    if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                        adapter.log.debug('detected new value on port [' + _port + '_B' + ']: ' + (secondary ? true : false));
                        adapter.setState(_ports[_port].id + '_B', {val: secondary ? true : false, ack: true, q: q});
                    }
                }
            /*} else // internal temperature sensor
            if (_ports[_port].pty == 4) {
                adapter.log.debug('detected new value on port [' + _port + ']: ' + value);
                adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});*/
            }

            _ports[_port].value    = value;
            _ports[_port].q        = q;
            if (secondary !== null) _ports[_port].secondary = secondary;
        }
    }
}


// обработка полученных данных от порта 1Wire-шины ------------------------------------------------------
function processPortStateW(_port, value) {      //1Wire
   var _ports = adapter.config.ports;
   //var _sensors1wBus = adapter.config.sensors1wbus;
   //var sensors1wBus = adapter.config.sensors1wbus;
   var q = 0;
   //var portAnswer = [];

   if (!_ports[_port]) {
       // No configuration found
       adapter.log.warn('Unknown port: ' + _port);
       return;
   }

   if (value !== null) {
      //var secondary = null;
      //var f;
      // Value can be 30c5b8000000:27.50;32c5b8000000:28.81;31c5b8000000:27.43.......
      // d0016c070000:24.43
      if (typeof value == 'string') {
         var sensorsAnswers  = value.split(';');
         var oneSensor = [];
         //var found    = false;
         //var foundedj = 0;
         var address_1w = "";
         var temperature = 0;
         for (var i = 0; i < sensorsAnswers.length; i++) {
            oneSensor    = sensorsAnswers[i].split(':');
            address_1w   = oneSensor[0];
            temperature  = parseFloat(oneSensor[1]);
            /*
            portAnswer[i].address_1w = oneSensor[0];
            portAnswer[i].value      = parseFloat(oneSensor[1]);
            //portAnswer.push( buff[offset + i] );
            found = false;
            foundedj = 0;
            for (j = 0; j < sensors1wBus.length; j++ ) {
                if (sensors1wBus[j].address1w === portAnswer[i].address_1w) {
                   found = true;
                   foundedj = j;
                }
            }
            if (!found) {
               foundedj = sensors1wBus.length + 1;
            }
            sensors1wBus[foundedj].address1w   = portAnswer[i].address_1w;
            sensors1wBus[foundedj].temperature = portAnswer[i].value;
            if ( !found || _sensors1wBus[foundedj].address1w !== sensors1wBus[foundedj].address1w ) {
               adapter.setState('sensors1wbus['.foundedj.'].address1w', {val: portAnswer[i].address_1w, ack: true, q: q});
            }
            if ( !found || _sensors1wBus[foundedj].temperature !== sensors1wBus[foundedj].temperature ) {
               adapter.setState('sensors1wbus['.foundedj.'].temperature', {val: portAnswer[i].value, ack: true, q: q});
            }
            */
//            if (!_sensors1wBus.portAnswer[i].address_1w || _sensors1wBus.portAnswer[i].address_1w.temperature !== portAnswer[i].value) {
               adapter.log.debug('новое значение температуры, адрес датчика = ' + address_1w + ', температура = ' + temperature );
               //adapter.setState('sensors1wbus.'.address_1w.'.temperature', {val: temperature, ack: true, q: q}, true);            
//            }
         }

         // If status changed
         if ( value !== _ports[_port].value ) {
            // JSON.parse(JSON.stringify(settings))
            _ports[_port].value    = value;
            _ports[_port].q        = q;
            adapter.log.debug('detected new value on port [' + _port + ']: ' + value );
            adapter.setState(_ports[_port].id, {val: value, ack: true, q: q}); 
         }
      }
   }
}    


//--------------------------------------------------------------------------------------------------------------
function pollStatus(dev) {
    /*for (var port = 0; port < adapter.config.ports.length; port++) {
        getPortState(port, processPortState);
    }*/
    getPortsState(function (err, data) {
        if (err) {
            adapter.log.warn(err);
            if (connected) {
                connected = false;
                adapter.log.warn('Device "' + adapter.config.ip + '" is disconnected');
                adapter.setState('info.connection', false, true);
            }
        } else {
            if (!connected) {
                adapter.log.info('Device "' + adapter.config.ip + '" is connected');
                connected = true;
                adapter.setState('info.connection', true, true);
            }
        }

        if (data) {
            var _ports = data.split(';');
            var p;
            for (p = 0; p < _ports.length; p++) {
                // process extra internal temperature later
                ///if (!adapter.config.ports[p] || adapter.config.ports[p].pty == 4) continue;
		if (!adapter.config.ports[p] || adapter.config.ports[p].pty == 3 && adapter.config.ports[p].d == 5) continue;
                processPortState(p, _ports[p]);
            }
            // process extra internal temperature
            /*if (askInternalTemp) {
                getInternalTemp(function (err, data) {
                    for (var po = 0; po < adapter.config.ports.length; po++) {
                        if (adapter.config.ports[po] && adapter.config.ports[po].pty == 4) {
                            processPortState(po, data);
                        }
                    }
                });
            }*/
	    // process 1Wire 
            if (ask1WireTemp) {
                //getPortStateW(function (err, data) {
                //    for (var po = 0; po < adapter.config.ports.length; po++) {
                //        if (adapter.config.ports[po] && adapter.config.ports[po].pty == 3 && adapter.config.ports[po].d == 5) {
                //            processPortStateW(po, data);
                //        }
                //    }
                //});

                for (var po = 0; po < adapter.config.ports.length; po++) {
                    if (adapter.config.ports[po] && adapter.config.ports[po].pty == 3 && adapter.config.ports[po].d == 5) {
                       getPortStateW( adapter.config.ip,
                                      adapter.config.password,
                                      po,
                                      function (po, data) {
                                           processPortStateW(po, data);
                                      }
                                    );
                    }
                }



            }
        }
    });
}

//---------------------------------------------------------------------------------------------------------------
// Process http://ioBroker:80/instance/?pt=6
function restApi(req, res) {
    var values = {};
    var url    = req.url;
    var pos    = url.indexOf('?');

    if (pos != -1) {
        var arr = url.substring(pos + 1).split('&');
        url = url.substring(0, pos);

        for (var i = 0; i < arr.length; i++) {
            arr[i] = arr[i].split('=');
            values[arr[i][0]] = (arr[i][1] === undefined) ? null : arr[i][1];
        }
        if (values.prettyPrint !== undefined) {
            if (values.prettyPrint === 'false') values.prettyPrint = false;
            if (values.prettyPrint === null)    values.prettyPrint = true;
        }
        // Default value for wait
        if (values.wait === null) values.wait = 2000;
    }

    var parts  = url.split('/');
    var device = parts[1];

    if (!device || (device != adapter.instance && (!adapter.config.name || device != adapter.config.name))) {
        if (device && values.pt !== undefined) {
            // Try to find name of the instance
            if (parseInt(device, 10) == device) {
                adapter.sendTo('megadjt.' + device, 'send', {pt: parseInt(values.pt, 10), val: values.ib});
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end('OK', 'utf8');
            } else {
                // read all instances of megaD
                adapter.getForeignObjects('system.adapter.megadjt.*', 'instance', function (err, arr) {
                    if (arr) {
                        for (var id in arr) {
                            if (arr[id].native.name == device) {
                                adapter.sendTo(id, 'send', {pt: parseInt(values.pt, 10), val: values.ib});
                                res.writeHead(200, {'Content-Type': 'text/html'});
                                res.end('OK', 'utf8');
                                return;
                            }
                        }
                    }

                    res.writeHead(500);
                    res.end('Cannot find ' + device);
                });
            }
        } else {
            res.writeHead(500);
            res.end('Error: unknown device name "' + device + '"');
        }
        return;
    }
    
    if (values.pt !== undefined) {
        var _port = parseInt(values.pt, 10);

        if (adapter.config.ports[_port]) {
            // If digital port
            ///if (!adapter.config.ports[_port].pty && adapter.config.ports[_port].m != 1) {
	    if (adapter.config.ports[_port].pty == 0 && adapter.config.ports[_port].misc != 1) {
                adapter.config.ports[_port].oldValue = adapter.config.ports[_port].value;
                adapter.config.ports[_port].value = !adapter.config.ports[_port].m ? 1 : 0;
                processClick(_port);
            } else if (adapter.config.ports[_port].pty == 3 && adapter.config.ports[_port].d == 4) {
                // process iButton
                adapter.setState(adapter.config.ports[_port].id, values.ib, true);
            } else {
                adapter.log.debug('reported new value for port ' + _port + ', request actual value');
                // Get value from analog port
                getPortState(_port, processPortState);
            }

            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end('OK', 'utf8');

            return;
        } else {
            res.writeHead(500);
            res.end('Error: port "' + _port + '". Not configured', 'utf8');
            return;
        }
    }
    res.writeHead(500);
    res.end('Error: invalid input "' + req.url + '". Expected /' + (adapter.config.name || adapter.instance) + '/?pt=X', 'utf8');
}

//-----------------------------------------------------------------------------------------------------------------------
// отправка команды Меге
function sendCommand(port, value) {
    var data = 'cmd=' + port + ':' + value;

    var parts = adapter.config.ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + adapter.config.ip);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
            if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                ///if (!adapter.config.ports[port].m) {
		if (adapter.config.ports[port].m == 0) {
                    adapter.setState(adapter.config.ports[port].id, value ? true : false, true);
                ///} else {
                }
                if (adapter.config.ports[port].m == 1) {
                    var f = value * adapter.config.ports[port].factor + adapter.config.ports[port].offset;
                    f = Math.round(f * 1000) / 1000;
                    adapter.setState(adapter.config.ports[port].id, f, true);
                }
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//-----------------------------------------------------------------------------------------------------------------
function sendCommandToDSA(port, value) {          //DS2413 port A
    //http://192.168.1.14/sec/?cmd=7A:0 or &cmd=7A:1
    var data = 'cmd=' + port + 'A' + ':' + value;
    
    var parts = adapter.config.ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + adapter.config.ip);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
            if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                adapter.setState(adapter.config.ports[port].id + '_A', value ? true : false, true);
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//------------------------------------------------------------------------------------------------------------
function sendCommandToDSB(port, value) {          //DS2413 port B
    //http://192.168.1.14/sec/?cmd=7A:0 or &cmd=7A:1
    var data = 'cmd=' + port + 'B' + ':' + value;
    
    var parts = adapter.config.ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + adapter.config.ip);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
	    if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                adapter.setState(adapter.config.ports[port].id + '_B', value ? true : false, true);
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//----------------------------------------------------------------------------------------------------------
function sendCommandToCounter(port, value) {
    //'http://192.168.0.52/sec/?pt=2&cnt=0'
    var data = 'pt=' + port + '&cnt=' + (value || 0);

    var parts = adapter.config.ip.split(':');

    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + adapter.config.password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + adapter.config.ip);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//---------------------------------------------------------------------------------------------------------
function addToEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos == -1) {
                obj.common.members.push(id);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

//---------------------------------------------------------------------------------------------------------
function removeFromEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos != -1) {
                obj.common.members.splice(pos, 1);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

//----------------------------------------------------------------------------------------------------
function syncObjects() {

    adapter.config.longPress   = parseInt(adapter.config.longPress,   10) || 0;
    adapter.config.doublePress = parseInt(adapter.config.doublePress, 10) || 0;

    var newObjects = [];
    ports = {};
    if (adapter.config.ports) {
        for (var p = 0; p < adapter.config.ports.length; p++) {
            var settings = adapter.config.ports[p];
            ///var id = (p == 14 || p == 15) ? ('a' + (p - 8)) : ('p' + p);
            var id = (p == 37) ? ('p' + p) : ('p' + p);

            if (settings.name) {
                id += '_' + settings.name.replace(/[\s.]/g, '_');
            }
            adapter.config.ports[p].id  = adapter.namespace + '.' + id;
            adapter.config.ports[p].pty = parseInt(adapter.config.ports[p].pty, 10) || 0;
            if (adapter.config.ports[p].m !== undefined) {
                adapter.config.ports[p].m = parseInt(adapter.config.ports[p].m, 10) || 0;
            }
            if (adapter.config.ports[p].d !== undefined) {
                adapter.config.ports[p].d = parseInt(adapter.config.ports[p].d, 10) || 0;
            }
            /*if (adapter.config.ports[p].misc !== undefined) {
                adapter.config.ports[p].misc = parseInt(adapter.config.ports[p].misc, 10) || 0;
            }*/
	    if (adapter.config.ports[p].misc === 'false' || adapter.config.ports[p].misc === false) adapter.config.ports[p].misc = 0;
            if (adapter.config.ports[p].misc === 'true'  || adapter.config.ports[p].misc === true)  adapter.config.ports[p].misc = 1;
		
            settings.port = p;

            var obj = {
                _id: adapter.namespace + '.' + id,
                common: {
                    name: settings.name || ('P' + p),
                    role: settings.role,
                    type: settings.type  // ??????????????????
                },
                native: JSON.parse(JSON.stringify(settings)),
                type:   'state'
            };
            var obj1 = null;
            var obj2 = null;
            var obj3 = null;

            // input
            if (!settings.pty) {
                //obj.common.write = false;
                obj.common.write = true; // надо иметь возможность писать сюда данные от меги
                obj.common.read  = true;
                obj.common.def   = false;
                obj.common.desc  = 'P' + p + ' - digital input';
                obj.common.type  = 'boolean';
                if (!obj.common.role) obj.common.role = 'state';

                ///if (settings.m == 1) {
		if (settings.m == 1 || settings.misc == 1) {
                    if (settings.long && adapter.config.longPress) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_long',
                            common: {
                                name:  obj.common.name + '_long',
                                role:  'state',
                                //write: false,
                                write: true,
                                read:  true,
                                def:   false,
                                desc:  'P' + p + ' - long press',
                                type:  'boolean'
                            },
                            native: JSON.parse(JSON.stringify(settings)),
                            type: 'state'
                        };
                        if (obj1.native.double !== undefined) delete obj1.native.double;
                    }
                }

                if (settings.double && adapter.config.doublePress) {
                    obj2 = {
                        _id: adapter.namespace + '.' + id + '_double',
                        common: {
                            name:  obj.common.name + '_double',
                            role:  'state',
                            //write: false,
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - double press',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type:   'state'
                    };
                    if (obj2.native.long !== undefined) delete obj2.native.long;
                }
                obj3 = {
                    _id: adapter.namespace + '.' + id + '_counter',
                    common: {
                        name:  obj.common.name + '_counter',
                        role:  'state',
                        write: true,
                        read:  true,
                        def:   0,
                        desc:  'P' + p + ' - inputs counter',
                        type:  'number'
                    },
                    native: JSON.parse(JSON.stringify(settings)),
                    type:   'state'
                };
            } else
            // output
            if (settings.pty == 1) {
                ///if (settings.m) {
		if (settings.m == 1) {
                    settings.factor  = parseFloat(settings.factor || 1);
                    settings.offset  = parseFloat(settings.offset || 0);

                    obj.common.write = true;
                    obj.common.read  = true;
                    obj.common.def   = 0;
                    obj.common.desc  = 'P' + p + ' - digital output (PWM)';
                    obj.common.type  = 'number';
                    obj.common.min   = 0;
                    obj.common.max   = 255;
                    if (!obj.common.role) obj.common.role = 'level';
                    ///obj.native.pwm = settings.pwm;
                } else
		if (settings.m == 0) {
                    obj.common.write = true;
                    obj.common.read  = true;
                    obj.common.def   = false;
                    obj.common.desc  = 'P' + p + ' - digital output';
                    obj.common.type  = 'boolean';
                    if (!obj.common.role) obj.common.role = 'state';
                } else
		if (settings.m == 2) {   //DS2413
                    obj = {
                        _id: adapter.namespace + '.' + id + '_A',
                        common: {
                            name:  obj.common.name + '_A',
                            role:  'button',
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - digital output A',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type:   'state'
                    };
                    if (obj.native.misc !== undefined) delete obj.native.misc;
                    if (obj.native.m2 !== undefined) delete obj.native.m2;
                    if (obj.native.fr !== undefined) delete obj.native.fr;
                    ////if (obj.native.id) obj.native.id = adapter.namespace + '.' + id + '_A';
                    
		    obj1 = {
                        _id: adapter.namespace + '.' + id + '_B',
                        common: {
                            name:  obj.native.name + '_B',
			    role:  'button',
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - digital output B',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type: 'state'
                    };
                    if (obj1.native.misc !== undefined) delete obj1.native.misc;
                    if (obj1.native.m2 !== undefined) delete obj1.native.m2;
                    if (obj1.native.fr !== undefined) delete obj1.native.fr;
                    ////if (obj1.native.id) obj1.native.id = adapter.namespace + '.' + id + '_B';
                }
            } else
            // analog ADC
            if (settings.pty == 2) {
                settings.factor  = parseFloat(settings.factor || 1);
                settings.offset  = parseFloat(settings.offset || 0);

                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.min   = settings.offset;
                obj.common.max   = settings.offset + settings.factor;
                obj.common.desc  = 'P' + p + ' - analog input';
                obj.common.type  = 'number';
                if (!obj.common.role) obj.common.role = 'value';
                obj.native.threshold = settings.offset + settings.factor * settings.misc;
            } else
            // digital temperature sensor
            if (settings.pty == 3) {
                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.type  = 'number';
                if (settings.d == 1 || settings.d == 2 || settings.d == 3) {
                    obj.common.min = -30;
                    obj.common.max = 30;
                    obj.common.unit = '°C';
                    obj.common.desc = 'P' + p + ' - temperature';
                    obj.common.type = 'number';
                    if (!obj.common.role) obj.common.role = 'value.temperature';

                    if (settings.d == 1 || settings.d == 2) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_humidity',
                            common: {
                                name: obj.common.name + '_humidity',
                                role: 'value.humidity',
                                //write: false,
                                write: true,
                                read: true,
                                unit: '%',
                                def: 0,
                                min: 0,
                                max: 100,
                                desc: 'P' + p + ' - humidity',
                                type: 'number'
                            },
                            native: {
                                port: p
                            },
                            type: 'state'
                        };
                    }
                } else if (settings.d == 4) { // iButton
                    obj.common.desc = 'P' + p + ' - iButton';
                    obj.common.type = 'string';
                    obj.common.def  = '';
		} else if (settings.d == 5) { // 1Wire
		    obj = {
                        _id: adapter.namespace + '.' + id + '_temperature1',
                        common: {
                            name: obj.common.name + '_temperature1',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
                        },
                        type:   'state'
                    };
                    obj1 = {
                        _id: adapter.namespace + '.' + id + '_temperature2',
                        common: {
                            name: obj.native.name + '_temperature2',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
			},
                        type: 'state'
                    };
                    obj2 = {
                        _id: adapter.namespace + '.' + id + '_temperature3',
                        common: {
                            name: obj.native.name + '_temperature',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
                        },
                        type: 'state'
		    };
                }    
            /*} else
            // internal digital temperature sensor
            if (settings.pty == 4) {
                obj.common.write = false;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.min   = -30;
                obj.common.max   = 30;
                obj.common.unit  = '°C';
                obj.common.desc  = 'P' + p + ' - temperature';
                obj.common.type  = 'number';
                if (!obj.common.role) obj.common.role = 'value.temperature';*/
	    } else
            // I2C sensor  //NEW
            if (settings.pty == 4) {
                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.type  = 'number';
                if (settings.d == 1) {
                    obj.common.min = -30;
                    obj.common.max = 30;
                    obj.common.unit = '°C';
                    obj.common.desc = 'P' + p + ' - temperature';
                    obj.common.type = 'number';
                    if (!obj.common.role) obj.common.role = 'value.temperature';
		    if (settings.d == 1) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_humidity',
                            common: {
                                name: obj.common.name + '_humidity',
                                role: 'value.humidity',
                                //write: false,
                                write: true,
                                read: true,
                                unit: '%',
                                def: 0,
                                min: 0,
                                max: 100,
                                desc: 'P' + p + ' - humidity',
				type: 'number'
                            },
                            native: {
                                port: p
                            },
                            type: 'state'
                        };
                    }
                } else if (settings.d == 2 || settings.d == 3) { // Light Sensors
                    obj.common.desc = 'P' + p + ' - light';
                    obj.common.type = 'number';
                    obj.common.def  = 0;
                    obj.common.role = 'value';
                }
            } else {
                continue;
            }

            newObjects.push(obj);
            ports[obj._id] = obj;

            if (obj1) {
                newObjects.push(obj1);
                ports[obj1._id] = obj1;
            }
            if (obj2) {
                newObjects.push(obj2);
                ports[obj2._id] = obj2;
            }
            if (obj3) {
                newObjects.push(obj3);
                ports[obj3._id] = obj3;
            }
        }
    }

    // read actual objects
    adapter.getStatesOf('', '', function (err, _states) {
        var i;
        var j;
        var found;
        // synchronize actual and new

        // Sync existing
        for (i = 0; i < newObjects.length; i++) {
            for (j = 0; j < _states.length; j++) {
                if (newObjects[i]._id == _states[j]._id) {
                    var mergedObj = JSON.parse(JSON.stringify(_states[j]));

                    if (mergedObj.common.history) delete mergedObj.common.history;
                    if (mergedObj.common.mobile)  delete mergedObj.common.mobile;

                    if (JSON.stringify(mergedObj) != JSON.stringify(newObjects[i])) {
                        adapter.log.info('Update state ' + newObjects[i]._id);
                        if (_states[j].common.history) newObjects[i].common.history = _states[j].common.history;
                        if (_states[j].common.mobile)  newObjects[i].common.mobile  = _states[j].common.mobile;
                        adapter.setObject(newObjects[i]._id, newObjects[i]);
                    }

                    if (newObjects[i].native.room != _states[j].native.room) {
                        adapter.log.info('Update state room ' + newObjects[i]._id + ': ' + _states[j].native.room + ' => ' + newObjects[i].native.room);
                        if (_states[j].native.room) removeFromEnum(_states[j].native.room, _states[j]._id);
                        if (newObjects[i].native.room) addToEnum(newObjects[i].native.room, newObjects[i]._id);
                    }

                    if (newObjects[i].native.func != _states[j].native.func) {
                        adapter.log.info('Update state func ' + newObjects[i]._id + ': ' + _states[j].native.func + ' => ' + newObjects[i].native.func);
                        if (_states[j].native.func) removeFromEnum(_states[j].native.func, _states[j]._id);
                        if (newObjects[i].native.func) addToEnum(newObjects[i].native.func, newObjects[i]._id);
                    }

                    break;
                }
            }
        }

        // Add new
        for (i = 0; i < newObjects.length; i++) {
            found = false;
            for (j = 0; j < _states.length; j++) {
                if (newObjects[i]._id == _states[j]._id) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                adapter.log.info('Add state ' + newObjects[i]._id);

                adapter.setObject(newObjects[i]._id, newObjects[i]);
                // check room
                if (newObjects[i].native.room) addToEnum(newObjects[i].native.room, newObjects[i]._id);
                if (newObjects[i].native.func) addToEnum(newObjects[i].native.func, newObjects[i]._id);
            }
        }

        // Delete old
        for (j = 0; j < _states.length; j++) {
            found = false;
            for (i = 0; i < newObjects.length; i++) {
                if (newObjects[i]._id == _states[j]._id) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                adapter.log.info('Delete state ' + _states[j]._id);
                adapter.delObject(_states[j]._id);
                if (_states[j].native.room) removeFromEnum(_states[j].native.room, _states[j]._id);
                if (_states[j].native.func) removeFromEnum(_states[j].native.func, _states[j]._id);
            }
        }

        // if internal temperature desired
        /*for (var po = 0; po < adapter.config.ports.length; po++) {
            if (adapter.config.ports[po].pty == 4) {
                askInternalTemp = true;
                break;
            }
        }*/
	    
	// if 1Wire
	for (var po = 0; po < adapter.config.ports.length; po++) {
            if (adapter.config.ports[po].pty && // для остановки undefined
                  adapter.config.ports[po].pty == 3 && adapter.config.ports[po].d == 5) {
                ask1WireTemp = true;
                break;
            }
        }

        if (adapter.config.ip && adapter.config.ip != '0.0.0.0') {
            pollStatus();
            setInterval(pollStatus, adapter.config.pollInterval * 1000);
        }

        if (adapter.config.ip && adapter.config.ip != '0.0.0.0') {
            pollStatus();
            setInterval(pollStatus, adapter.config.pollInterval * 1000);
        }
    });
}


//---------------------------------------------------------------------------------------------
//settings: {
//    "port":   8080,
//    "auth":   false,
//    "secure": false,
//    "bind":   "0.0.0.0", // "::"
//    "cache":  false
//}
function main() {
    adapter.setState('info.connection', false, true);

    adapter.setState( 'sms.apikey', {val: "896", ack: true});           
    
    if (adapter.config.ip) {
        adapter.config.port = parseInt(adapter.config.port, 10) || 0;
        if (adapter.config.port) {
            server = require('http').createServer(restApi);

            adapter.getPort(adapter.config.port, function (port) {
                if (port != adapter.config.port && !adapter.config.findNextPort) {
                    adapter.log.warn('port ' + adapter.config.port + ' already in use');
                } else {
                    server.listen(port);
                    adapter.log.info('http server listening on port ' + port);
                }
            });
        } else {
            adapter.log.info('No port specified');
        }
        getFirmwareVersion();
        //getActual2561FirmwareVersion();
    }
    syncObjects();
    adapter.subscribeStates('*');
    processMessages(true);
}



