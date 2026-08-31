import {
  ClientSession,
  DeleteResult,
  PopulateOptions,
  UpdateQuery,
} from 'mongoose';
import {
  HydratedDocument,
  ProjectionType,
  QueryFilter,
  QueryOptions,
  Types,
} from 'mongoose';
import { Model } from 'mongoose';

abstract class BaseRepo<TDocument> {
  constructor(private Model: Model<TDocument>) {}

  public async create(
    data: Partial<TDocument> | Partial<TDocument>[],
    options?: { session?: ClientSession },
  ): Promise<HydratedDocument<TDocument>> {
    if (options?.session) {
      const docs = await this.Model.create(
        (Array.isArray(data) ? data : [data]) as any,
        { session: options.session },
      );
      return docs[0] as HydratedDocument<TDocument>;
    }
    return this.Model.create(data as any);
  }

  public async findById(
    id: string | Types.ObjectId,
    projection?: ProjectionType<TDocument> | null,
    options?: QueryOptions<TDocument> | null,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findById(id, projection, options);
  }

  public async findOne({
    filter,
    projection,
    options,
  }: {
    filter: QueryFilter<TDocument>;
    projection?: ProjectionType<TDocument> | null | undefined;
    options?: QueryOptions<TDocument> | null | undefined;
  }): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findOne(filter, projection, options);
  }

  public async find({
    filter,
    projection,
    options,
  }: {
    filter?: QueryFilter<TDocument>;
    projection?: ProjectionType<TDocument>;
    options?: QueryOptions<TDocument>;
  } = {}): Promise<HydratedDocument<TDocument>[]> {
    let query = this.Model.find(filter ?? {}, projection);
    if (options?.sort) {
      query = query.sort(options.sort);
    }
    if (options?.skip !== undefined && options?.skip !== null) {
      query = query.skip(options.skip);
    }
    if (options?.limit !== undefined && options?.limit !== null) {
      query = query.limit(options.limit);
    }
    if (options?.populate) {
      query = query.populate(options.populate as PopulateOptions);
    }
    return query.exec();
  }

  async findOneAndUpdate({
    filter,
    update,
    options,
  }: {
    filter: QueryFilter<TDocument>;
    update: UpdateQuery<TDocument>;
    options?: QueryOptions<TDocument>;
  }): Promise<HydratedDocument<TDocument> | null> {
    const { new: _, ...cleanOptions } = (options || {}) as any;
    return this.Model.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...cleanOptions,
    }) as any;
  }

  async findByIdAndUpdate({
    id,
    update,
    options,
  }: {
    id: string | Types.ObjectId;
    update: UpdateQuery<TDocument>;
    options?: QueryOptions<TDocument>;
  }): Promise<HydratedDocument<TDocument> | null> {
    const { new: _, ...cleanOptions } = (options || {}) as any;
    return this.Model.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
      ...cleanOptions,
    }) as any;
  }

  async findOneAndDelete({
    filter,
    options,
  }: {
    filter: QueryFilter<TDocument>;
    options?: QueryOptions<TDocument>;
  }): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findOneAndDelete(filter, options);
  }

  async findByIdAndDelete(
    id: string | Types.ObjectId,
    options?: QueryOptions<TDocument>,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findByIdAndDelete(id, options);
  }

  async deleteMany({
    filter,
    options,
  }: {
    filter?: QueryFilter<TDocument>;
    options?: QueryOptions<TDocument> | null;
  }): Promise<DeleteResult> {
    return this.Model.deleteMany(filter ?? {}, options as any);
  }

  async paginate({
    page,
    limit,
    skip,
    sort,
    populate,
    search,
  }: {
    page?: number;
    limit?: number;
    skip?: number;
    sort?: QueryOptions<TDocument>['sort'];
    populate?: PopulateOptions | PopulateOptions[];
    search?: QueryFilter<TDocument>;
  }) {
    page = Number(page) || 1;
    limit = Number(limit) || 10;

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;

    const computedSkip = skip !== undefined ? skip : (page - 1) * limit;

    let query = this.Model.find(search ?? {})
      .limit(limit)
      .skip(computedSkip);

    if (sort) {
      query = query.sort(sort);
    }
    if (populate) {
      query = query.populate(populate);
    }

    const [data, totalDoc] = await Promise.all([
      query.exec(),
      this.Model.countDocuments(search ?? {}),
    ]);
    const totalPages = Math.ceil(totalDoc / limit);

    return {
      meta: {
        currentPage: page,
        totalPages,
        limit,
        totalDoc,
      },
      data,
    };
  }

  async exists(filter: QueryFilter<TDocument>): Promise<boolean> {
    const res = await this.Model.exists(filter);
    return !!res;
  }

  async countDocuments(filter?: QueryFilter<TDocument>): Promise<number> {
    return this.Model.countDocuments(filter ?? {});
  }
}

export default BaseRepo;
