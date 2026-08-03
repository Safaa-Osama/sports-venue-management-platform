import { Request } from "express";
import multer, { FileFilterCallback } from "multer";
import { tmpdir } from 'os';
import { BadRequestException } from "@nestjs/common";
import { MulterEnum, StoreEnum } from "../enums/multerEnum";


export const multer_cloud = ({
  storeType = StoreEnum.memory,
  customType = MulterEnum.image,
  maxFileSize = 5 * 1024 * 1024,
}: {
  storeType?: StoreEnum;
  customType?: string[];
  maxFileSize?: number;
} = {}) => {

  const storage =
    storeType === StoreEnum.memory ?
      multer.memoryStorage()
      :
      multer.diskStorage({
        destination: tmpdir(),
        filename(req, file, cb) {
          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + "_" + file.originalname);
        },
      });

  function fileFilter(
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) {
    if (!customType.includes(file.mimetype)) {
      return cb(new BadRequestException("Invalid Image Type"));
    }
    cb(null, true);
  }

  return {
    storage,
    fileFilter,
    limits: { fileSize: maxFileSize, },
  };
};