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
            .on('finish', () => {
                //console.log('finish', arguments)
                this.coco(mux.toArray())
                //fs.writeFileSync('woot', mux.toBuffer());
                return resolve(sanitize(video.snippet.title))
            })
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

        //var testData = new Uint8Array(fs.readFileSync('./videos/video'));

        //this.coco(testData)

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
            console.log(JSON.stringify(videos.items.map(video => `${video.id}, ${video.snippet.title}`), 0, 2))

            //youtube.convert("Guns N' Roses - Sweet Child O' Mine")

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
xxx()
//youtube.getWoot()





