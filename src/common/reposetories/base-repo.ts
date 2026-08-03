import { DeleteResult, PopulateOptions, UpdateQuery } from 'mongoose';
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
    data: Partial<TDocument>,
  ): Promise<HydratedDocument<TDocument>> {
    return this.Model.create(data);
  }

  public async findById(
    id: string | Types.ObjectId,
  ): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findById(id);
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
    let query = this.Model.find(filter, projection)
      .sort(options?.sort)
      .limit(options?.limit!)
      .skip(options?.skip!);
    if (options?.populate) {
      query = query.populate(options.populate as PopulateOptions);
    }
    return query;
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
    return this.Model.findOneAndUpdate(filter, update, {
      new: true,
      ...options,
    });
  }

  async findByIdAndUpdate({
    id,
    update,
    options,
  }: {
    id: Types.ObjectId;
    update: UpdateQuery<TDocument>;
    options?: QueryOptions<TDocument>;
  }): Promise<HydratedDocument<TDocument> | null> {
    return this.Model.findByIdAndUpdate(id, update, { new: true, ...options });
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

  async deleteMany({
    filter,
    options,
  }: {
    filter?: QueryFilter<TDocument>;
    options?: QueryOptions<TDocument> | null;
  }): Promise<DeleteResult> {
    return this.Model.deleteMany(filter, options as any);
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
    page = +page! || 1;
    limit = +limit! || 2;

    if (page < 1) {
      page = 1;
    }
    if (limit < 1) {
      limit = 2;
    }
    if (!skip) {
      skip = (page - 1) * limit;
    }

    let query = this.Model.find({ ...(search ?? {}) })
      .limit(limit)
      .skip(skip)
      .sort(sort);
    if (populate) {
      query = query.populate(populate);
    }

    const [data, totalDoc] = await Promise.all([
      query.exec(),
      this.Model.countDocuments({ ...(search ?? {}) }),
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

  // async exists(filter: QueryFilter<TDocument>) {
  //     return this.Model.exists(filter)
  // }
  // const exists = await productRepo.exists(...)

  // const product = await productRepo.findOne(...)

  // async countDocuments(filter?: QueryFilter<TDocument>): Promise<number> {
  //     return this.Model.countDocuments(filter)
  // }
}

export default BaseRepo;
