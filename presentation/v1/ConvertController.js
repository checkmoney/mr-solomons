const { isValid, parseISO } = require('date-fns');

const { InvalidQueryException } = require('../error/InvalidQueryException');

class ConvertController {
  constructor({ moneyConverter, errorHandler, cache }) {
    this.moneyConverter = moneyConverter;
    this.errorHandler = errorHandler;
    this.cache = cache;
  }

  docs = {
    schema: {
      description: 'Convert money from one currency to another for exact date',
      summary: 'Convert money',
      query: {
        amount: {
          type: 'string',
          description:
            'String representation of money amount in penny (money * 100)',
        },
        from: {
          type: 'string',
          description: 'Original currency',
        },
        to: {
          type: 'string',
          description: 'Target currency',
        },
        date: {
          type: 'string',
          format: 'date',
          description: 'Date of transaction',
        },
      },
      response: {
        200: {
          description: 'Successful response',
          type: 'object',
          properties: {
            result: {
              type: 'string',
              description:
                'String representation of converted money amount in penny (money * 100)',
            },
          },
        },
        400: {
          description: 'Invalid request',
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message',
            },
            query: {
              type: 'object',
            },
          },
        },
      },
    },
  };

  handle = async ({ query }, reply) =>
    this.errorHandler.invoke(reply, async () => {
      await this._throwUnlessValid(query);

      const [cachedValue, saveToCache] = await this._useCache(query);

      if (cachedValue) {
        return {
          result: cachedValue,
        };
      }

      const { amount, from, to, date } = query;

      const money = {
        amount: BigInt(amount),
        currency: from.toUpperCase(),
      };
      const targetCurrency = to.toUpperCase();
      const when = parseISO(date);

      const { value, accurate } = await this.moneyConverter.convert(
        money,
        targetCurrency,
        when,
      );

      if (accurate) {
        await saveToCache(value.toString());
      }

      return {
        result: value.toString(),
      };
    });

  _throwUnlessValid = async query => {
    const requestIsValid = () => {
      try {
        const { from, to, amount, date } = query;

        const fromValid = from && from.length === 3;
        const toValid = to && to.length === 3;
        const amountValid = !isNaN(Number(amount));
        const dateValid = isValid(parseISO(date));

        return fromValid && toValid && amountValid && dateValid;
      } catch (error) {
        return false;
      }
    };

    if (!requestIsValid()) {
      throw new InvalidQueryException(query);
    }
  };

  _useCache = async ({ from, to, amount, date }) => {
    const key = `${from}_${to}_${amount}_${date}`;

    const cached = await this.cache.get(key);

    const setCached = async value => {
      await this.cache.set(key, value);
    };

    return [cached, setCached];
  };
}

module.exports = {
  ConvertController,
};
