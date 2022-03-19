import fs from 'fs';
import fsPromises from 'fs/promises';
import streamPromises from 'stream/promises';
import childProcess from 'child_process';
import { PassThrough, Writable } from 'stream';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { once } from 'events';
import Throttle from 'throttle';

import config from './config.js';
import { logger } from './util.js';

export class Service {
  constructor() {
    this.clientStreams = new Map();
    this.currentSong = config.constants.englishConversation;
    this.currentBitRate = 0;
    this.throttleTransform = {};
    this.currentReadable = {};
  }

  createClientStream() {
    const id = randomUUID();
    const clientStream = new PassThrough();
    this.clientStreams.set(id, clientStream);
    return {
      id,
      clientStream,
    };
  }

  removeClientStream(id) {
    this.clientStreams.delete(id);
  }

  _executeSoxCommand(args) {
    return childProcess.spawn('sox', args);
  }

  broadCast() {
    return new Writable({
      write: (chunk, enc, cb) => {
        for (const [id, stream] of this.clientStreams) {
          if (stream.writableEnded) {
            this.clientStreams.delete(id);
            continue;
          }

          stream.write(chunk);
        }

        cb();
      },
    });
  }

  async startStreaming() {
    logger.info(`starting with ${this.currentSong}`);
    const bitRate =
      (this.currentBitRate = await this.getBitRate(this.currentSong)) /
      config.constants.bitRateDivisor;
    const throttleTransform = (this.throttleTransform = new Throttle({
      bps: bitRate,
      chunkSize: bitRate / 20,
    }));
    const songReadable = (this.currentReadable = this.createFileStream(
      this.currentSong
    ));

    return streamPromises.pipeline(
      songReadable,
      throttleTransform,
      this.broadCast()
    );
  }

  stopStreaming() {
    this.throttleTransform?.end?.();
  }

  async getBitRate(song) {
    try {
      const args = [
        '--i', // info
        '-B', // BitRate
        song,
      ];

      const { stdout, stderr } = this._executeSoxCommand(args);

      await Promise.all([once(stdout, 'readable'), once(stderr, 'readable')]);

      const [success, error] = [stdout, stderr].map(stream => stream.read());

      if (error) return await Promise.reject(error);

      return success.toString().trim().replace(/k/, '000');
    } catch (error) {
      logger.error(`deu ruim no bitrate: ${error}`);
      return config.constants.fallBackBitRate;
    }
  }

  createFileStream(filename) {
    return fs.createReadStream(filename);
  }

  async getFileInfo(file) {
    const fullFilePath = join(config.dir.publicDirectory, file);
    await fsPromises.access(fullFilePath);
    const filetype = extname(fullFilePath);

    return {
      type: filetype,
      name: fullFilePath,
    };
  }

  async getFileStream(file) {
    const { name, type } = await this.getFileInfo(file);

    return {
      stream: this.createFileStream(name),
      type,
    };
  }

  async readFxByName(fxName) {
    const FXAudios = await fsPromises.readdir(config.dir.fxDirectory);
    const chosenFx = FXAudios.find(filename =>
      filename.toLowerCase().includes(fxName)
    );

    if (!chosenFx)
      return Promise.reject(new Error(`The song ${fxName} wasn't found`));

    return join(config.dir.fxDirectory, chosenFx);
  }

  appendFxStream(fx) {
    const throttleTransformable = new Throttle({
      bps: this.currentBitRate,
      chuckSize: this.currentBitRate / 20,
    });

    streamPromises.pipeline(throttleTransformable, this.broadCast());

    const unpipe = () => {
      const transformStream = this.mergeAudioStream(fx, this.currentReadable);
      this.throttleTransform = throttleTransformable;
      this.currentReadable = transformStream;
      this.currentReadable.removeListener('unpipe', unpipe);

      streamPromises.pipeline(transformStream, throttleTransformable);
    };
    
    this.throttleTransform.on('unpipe', unpipe);
    this.throttleTransform.pause();
    this.currentReadable.unpipe(this.throttleTransform);
  }

  mergeAudioStream(song, readable) {
    const transformStream = new PassThrough();
    const args = [
      '-t',
      config.constants.audioMediaType,
      '-v',
      config.constants.songVolume,
      '-m',
      '-', // receive as stream
      '-t',
      config.constants.audioMediaType,
      '-v',
      config.constants.fxVolume,
      song,
      '-t',
      config.constants.audioMediaType,
      '-',
    ];

    const { stdin, stdout } = this._executeSoxCommand(args);

    streamPromises
      .pipeline(readable, stdin)
      .catch(error => logger.error(`error on sending stream to sox: ${error}`));

    streamPromises
      .pipeline(stdout, transformStream)
      .catch(error =>
        logger.error(`error on receiving stream from sox: ${error}`)
      );

    return transformStream;
  }
}
