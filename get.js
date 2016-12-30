const fs = require('fs');
const googleapis = require("googleapis")
const bluebird = require( 'bluebird' );
const async = require('async');

const ytdl = require('ytdl-core');
const ffmpeg_mp4  = require('./node_modules/ffmpeg.js/ffmpeg-mp4.js');
const sanitize = require('sanitize-filename');

const path = require('path')
const memfs = require('memfs');
const unionfs = require('unionfs');
const Stream = require('stream');
const concat = require('concat-stream');
const ffmpeg = require('fluent-ffmpeg');
const moment = require('moment');

'use strict';
const acoustid = require("acoustid");
const NodeBrainz = require('nodebrainz');
const Coverart = require('coverart')
// Initialize NodeBrainz
var nodebrainz = new NodeBrainz({userAgent:'my-awesome-app/0.0.1 ( http://my-awesome-app.com )'});
var coverart = new Coverart({userAgent:'my-awesome-app/0.0.1 ( http://my-awesome-app.com )'});
/*
acoustid("musics/audio3.mp3", { key: "7h2L5KuGA2" }, function(err, results) {
    if (err) throw err;
    let artist = results[0].recordings[0].artists[0].name;
    //console.log(JSON.stringify(results,0,2));
    console.log('artist: ', artist)
});

nodebrainz.artist('e0140a67-e4d1-4f13-8a01-364355bee46e', {inc:'releases+release-groups+aliases'}, function(err, response){
    console.log(response);
});

coverart.releaseGroup('4dff2c59-0907-4a36-b18b-462a17909d35', function(err, response){
    console.log('cover:', response, err);
});
*/

class EchoStream extends Stream.Writable {
    constructor(options) {
        super(options);
        this.body = new Array();
    }
    /*write () {
        let ret = Stream.Writable.prototype.write.apply(this, arguments);
        if (!ret) this.emit('drain');
        return ret;
    }*/
    _write(chunk, encoding, callback) {
        if (!(chunk instanceof Buffer)) {
            return this.emit('error', new Error('Invalid data'));
        }
        //console.log('chunk.length: ', chunk.length);
        //this.write(chunk, encoding, callback);

        //let ret = Stream.Writable.prototype.write.apply(this, arguments);
        //console.log('ret: ', ret)
        //if (!ret) this.emit('drain');
        //return ret;
        this.body.push(chunk);
        return callback()
    }

    toBuffer () {
        return Buffer.concat(this.body);
    }

    toBufferX () {
        let buffers = [];
        this._writableState.getBuffer().forEach(function(data) {
            buffers.push(data.chunk);
        });
        return Buffer.concat(buffers);
    }

    toArray () {
        let buffer = this.toBuffer();
        return new Uint8Array(buffer);
    }

    toString () {
        return String.fromCharCode.apply(null, this.toArray());
    }

    end (chunk, encoding, callback) {
        console.log('end', this.toBuffer().length)
        //return this.toArray()
        let ret = Stream.Writable.prototype.end.apply(this, arguments);

        if (!ret) this.emit('finish');
    }

    close () {

        console.log('close:', arguments)
        /*
        var testData = new Uint8Array(fs.readFileSync('index.js'));
        //let array = this.toArray()
        console.log(testData);
        let array = this.toArray();
        let string = this.toString();
        console.log(array)
        console.log(string)
        //console.log(new Uint8Array(this.toBuffer()))
        */
    }
}

//var youtube = googleapis.youtube('v3');

//https://www.youtube.com/watch?v=JRfuAukYTKg SUPER !

class Youtube {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.googleapis = require('googleapis');
        this.bluebird = require('bluebird');
        this.youtube = this.googleapis.youtube('v3');
        this.myStream = new EchoStream({
            writable: true
        });
        this.videoDir = 'videos';
        this.musicDir = 'audios';
        this.audio = {
            format: 'mp3',
            extension: 'm3p',
            bitrate: '192K'
        }
    }

    getVideos(ids) {
        let part = 'id,snippet,contentDetails,player,recordingDetails,statistics,status,topicDetails';
        let options = {
            auth: this.apiKey,
            id: ids.join(','),
            part: part
        };
        return this.bluebird.promisify(this.youtube.videos.list)(options)
        .catch(function(err) {
          console.log('An error occured while running upload command: '.red + err.message);
          throw err;
        });
    }

    costox () {
        var url = 'https://www.youtube.com/watch?v=1w7OgIMMRc4';
        var audioOutput = path.resolve(__dirname, 'sound.mp4');
        ytdl(url, { 
            filter: function(f) {
                return f.container === 'mp4' && !f.encoding; 
            } 
        })
        .on('info', function (info) {
            //console.log(JSON.stringify(info,0,2))
        })
        // Write audio to file since ffmpeg supports only one input stream.
        .pipe(fs.createWriteStream(audioOutput))
        .on('finish', function() {
            ffmpeg()
            .input(ytdl(url, { filter: function(f) {
                return f.container === 'mp4' && !f.audioEncoding; } 
            }))
            .videoCodec('copy')
            .input(audioOutput)
            .audioCodec('copy')
            .save(path.resolve(__dirname, 'output.mp4'))
            .on('error', console.error)
            .on('progress', function(progress) {
                process.stdout.cursorTo(0);
                process.stdout.clearLine(1);
                //process.stdout.write(progress.timemark);
                console.log(progress)
            })
            .on('end', function() {
                console.log();
            });
        });
    }

    convert (fileName) {
        let inputFile = path.resolve(__dirname, this.videoDir, fileName);
        let outputFile = path.resolve(__dirname, this.musicDir, fileName);
        let videoData = new Uint8Array(fs.readFileSync(inputFile));

        if (!fs.existsSync(path.resolve(__dirname, this.musicDir))){
            fs.mkdirSync(path.resolve(__dirname, this.musicDir));
        }

        var testData = new Uint8Array(fs.readFileSync(inputFile));
        // Encode test video to VP8.
        var result = ffmpeg_mp4({
          MEMFS: [{name: "video.flv", data: testData}],
          //arguments: ["-i", "video.flv", "-b:a", "192K", "-vn", "out.mp3"],
          arguments: ["-i", "video.flv", "-q:a", "0", "-map", "a", "-stats" ,"out.mp3"],
          // Ignore stdin read requests.
          stdin: function() {},
          stdout: function (data) {
            console.log('data: ', data)
          },
          stderr: function(data) {
            console.log('data: ', String.fromCharCode(data));
          },
        });
        // Write out.webm to disk.
        var out = result.MEMFS[0];
        fs.writeFileSync(outputFile, Buffer(out.data));
    }

    videoDownload() {
        let p = path.resolve(__dirname);
        let concatStream = concat(function(x) {
            console.log(x.length)
        })
        let options = {
            //quality: 'highest',
            downloadURL: true,
            //filter: 'audioonly'
        }
        let mux = new EchoStream({
            //highWaterMark: 120141, //999999,
            writable: true
        });
        let url = 'https://www.youtube.com/watch?v=1w7OgIMMRc4'
        let stream = ytdl(url, options);
        stream
        .pipe(mux)
        .on('info', (info, format) => {
            fs.stat(p, (error, stats) => {
                if (error) {
                    fs.mkdirSync(p);
                }
                console.log('download', info.title);
                this.createSong(stream);
            });
        })
        .on('finish', () => {
            this.coco(mux.toArray())
        })
        .on('error', (error) => {
            //self.emit('error', error);
        });
    }

    downloadVideo (video) {
        //video.id = 'msZIL66yUq8';
        //video.snippet.title = 'beep-' + new Date().getTime();
        let url = `http://www.youtube.com/watch?v=${video.id}`
        //let output = path.resolve(`${__dirname}/data`, sanitize(video.snippet.title));
        let output = path.resolve(__dirname, this.videoDir, sanitize(video.snippet.title));
        console.log(output)
        if (!fs.existsSync(path.resolve(__dirname, this.videoDir))) {
            fs.mkdirSync(path.resolve(__dirname, this.videoDir));
        }

        let mux = new EchoStream({
            //highWaterMark: 120141, //999999,
            writable: true
        });

        let concatStream = concat(function(buffer) {
            console.log('concat: ', buffer.length)
        })

        console.log(`get: ${url} to ${output}`)
        return new Promise((resolve, reject) => {
            let yt = ytdl(url, {
                filter: function(format) {
                    return format.container === 'mp4';
                }
            })
            //.pipe(fs.createWriteStream(output))
            .pipe(mux)
            .on('close', () => {
                console.log('downloadVideo: close')
            })
            /*.on('finish', () => {
                //console.log('finish', arguments)
                this.coco(mux.toArray())
                //fs.writeFileSync('woot', mux.toBuffer());
                return resolve(sanitize(video.snippet.title))
            })*/
            .on('error', function (error) {
                console.log('error:', error)
                return reject(error);
            });
        })

    }

    removeFile (file) {
        return fs.stat(file, function (error, stats) {
            console.log(stats);//here we got all information of file in stats variable

            if (error) {
                return console.error(error);
            }

            fs.unlink('./server/upload/my.csv',function(error){
                if(error) return console.log(error);
                console.log('file deleted successfully');
            });
        });
    }
    coco (data, output) {
        // Encode test video to VP8.
        var result = ffmpeg_mp4({
          MEMFS: [{name: "video.flv", data: data}],
          //arguments: ["-i", "video.flv", "-b:a", "192K", "-vn", "out.mp3"],
          arguments: ["-i", "video.flv", "-q:a", "0", "-map", "a", "-stats" ,"out.mp3"],
          // Ignore stdin read requests.
          stdin: function() {},
          stdout: function (data) {
            console.log('data: ', data)
          },
          stderr: function(data) {
            console.log('data: ', String.fromCharCode(data));
          },
        });
        // Write out.webm to disk.
        var out = result.MEMFS[0];
        fs.writeFileSync(out.name, Buffer(out.data));
    }

    createSong(stream) {
      let x = new ffmpeg(stream)
        .audioBitrate(192)
        .saveToFile('out.mp3')
        .on('end', function() {
            console.log('converted!')
        })
        .on('progress', function(progress) {
            process.stdout.cursorTo(0);
            process.stdout.clearLine(1);
            process.stdout.write(progress.timemark);
        })
        .on('end', function() {
            console.log('end conversion!')
        })
    }

    getWoot() {
        let infile = fs.createReadStream('index.js');

        infile.on('data', data => {
            this.myStream.write(data);
        });
        infile.on('close', () => {
            //this.myStream.close();
            console.log(this.myStream.toString())
            //this.coco(this.myStream.toArray())
        });
    }

    getPlayListItems(playlistId) {
        let part = 'id,snippet,contentDetails,status';
        let options = {
            auth: this.apiKey,
            playlistId: playlistId,
            part: part,
            maxResults: 5,
            pageToken: null
        };
        let items = [];
        let nextPageToken = true;
        return new Promise((resolve, reject) => {
            async.doWhilst(callback => {
                return this.bluebird.promisify(this.youtube.playlistItems.list)(options)
                .then(list => callback(null, list))
                .catch(callback);
            }, function (list, callback) {
                items = items.concat(list.items);
                options.pageToken = list.nextPageToken;
                return false;list.nextPageToken;
            }, function (error, result) {
                if(error) {
                    return reject(error);
                } else {
                    return resolve(items)
                }
            });
        })
    }
}

//googleapis.client.setApiKey('AIzaSyB64sBmL-y8utR_BSHZEaM9KKRYchuEV80');
//var youtube = googleapis.youtube('v3');

var youtube = new Youtube('AIzaSyAPBCwcnohnbPXScEiVMRM4jYWc43p_CZU');

//youtube.getVideo('12CeaxLiMgE').then(console.log).catch(console.log)

//youtube.convert("Guns N' Roses - Sweet Child O' Mine")
function xxx() {
    youtube.getPlayListItems('PLCD0445C57F2B7F41')
    .then(items => {

        let videoIds = items.map(item => item.snippet.resourceId.videoId);
        youtube.getVideos(videoIds).then(videos => {
            
            let duration = videos.items[0].contentDetails.duration;
            let m = moment.duration(duration).asMilliseconds();
            let dd = moment.utc(m).format("HH:mm:ss.SSS");
            //console.log(JSON.stringify(dd, 0, 2))
            console.log(JSON.stringify(videos.items.map(video => `${video.id}, ${video.snippet.title} - ${dd}`), 0, 2))

            youtube.downloadVideo(videos.items[1]).then(result => {
                console.log('downloadVideo complete!', result)
                //this.convert(result)
            })

        })
        /*
        var iteratee = items.map(item => youtube.getVideo(item.snippet.resourceId.videoId))
        Promise.all(iteratee).then(videos => {
            console.log(JSON.stringify(videos.map(video => video.snippet.title), 0, 2))
        })
        console.log(JSON.stringify(iteratee,0,2))
        */
        //console.log(JSON.stringify(items.map(x => x.snippet.resourceId.videoId), 0, 2))
    })
}
//xxx()
youtube.videoDownload()
//youtube.costox()
//youtube.getWoot()





