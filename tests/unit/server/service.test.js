import { jest, expect, describe, test, beforeEach } from '@jest/globals';
import TestUtil from '../_util/testUtil.js';
import fsPromises from 'fs/promises';
import fs from 'fs';

import { Service } from '../../../server/services.js';
import config from '../../../server/config.js';

describe('#Service - test suite for test data processing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('#createFileStream', () => {
    const currentReadable = TestUtil.generateReadableStream(['teste']);
    jest.spyOn(fs, fs.createReadStream.name).mockReturnValue(currentReadable);

    const service = new Service();
    const file = 'file.html';
    const result = service.createFileStream(file);

    expect(result).toStrictEqual(currentReadable);
    expect(fs.createReadStream).toHaveBeenCalledWith(file);
  });

  test('#getFileInfo', async () => {
    jest.spyOn(fsPromises, fsPromises.access.name).mockResolvedValue();

    const currentSong = 'mySong.mp3';
    const service = new Service();
    const result = await service.getFileInfo(currentSong);
    const expectResult = {
      type: '.mp3',
      name: `${config.dir.publicDirectory}/${currentSong}`,
    };

    expect(result).toStrictEqual(expectResult);
  });

  test('#getFileStream', async () => {
    const currentReadable = TestUtil.generateReadableStream(['teste']);
    const currentAudio = 'myAudio.mp3';
    const currentAudioFullPath = `${config.dir.publicDirectory}/${currentAudio}`;
    const fileInfo = {
      type: '.mp3',
      name: currentAudioFullPath,
    };

    const service = new Service();

    jest.spyOn(service, service.getFileInfo.name).mockResolvedValue(fileInfo);
    jest
      .spyOn(service, service.createFileStream.name)
      .mockReturnValue(currentReadable);

    const result = await service.getFileStream(currentAudio);
    const expectResult = {
      type: fileInfo.type,
      stream: currentReadable,
    };
    expect(result).toStrictEqual(expectResult);
    expect(service.getFileInfo).toHaveBeenCalledWith(currentAudio);
    expect(service.createFileStream).toHaveBeenCalledWith(fileInfo.name);
  });
});
